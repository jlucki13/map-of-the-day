/**
 * Local (non-LLM) guess matching and hint-leak checking.
 *
 * matchGuessLocally is a cheap, deterministic first pass: exact/typo matches
 * resolve as "correct" without ever calling an LLM, clearly-unrelated guesses
 * resolve as "incorrect", and everything in between is "ambiguous" so a
 * higher-level LLM judge can make the call. Callers must treat "ambiguous"
 * as "needs the judge", not as a guess.
 *
 * hintLeaksAnswer is a hard backstop against a generated hint spelling out
 * the answer, checked independently of whatever an LLM concluded.
 */

const LEADING_ARTICLES = ["the ", "a ", "la ", "le ", "el "];

const ACRONYM_STOPWORDS = new Set(["of", "the", "and", "de", "la", "le", "el"]);

/**
 * lowercase, Unicode NFD + strip combining marks (diacritic-insensitive),
 * strip punctuation, strip a leading article, collapse whitespace.
 */
export function normalizeGuess(s: string): string {
  let out = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip combining diacritical marks

  // Strip punctuation, keep letters/numbers/whitespace (Unicode-aware).
  out = out.replace(/[^\p{L}\p{N}\s]/gu, " ");
  out = out.replace(/\s+/g, " ").trim();

  for (const article of LEADING_ARTICLES) {
    if (out.startsWith(article)) {
      out = out.slice(article.length);
      break;
    }
  }

  return out.replace(/\s+/g, " ").trim();
}

/**
 * True Damerau-Levenshtein edit distance (insertions, deletions,
 * substitutions, and adjacent transpositions), implemented directly so we
 * don't need an extra dependency for a handful of short-string comparisons.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  const maxDist = lenA + lenB;
  const d: number[][] = Array.from({ length: lenA + 2 }, () =>
    new Array<number>(lenB + 2).fill(0),
  );

  d[0][0] = maxDist;
  for (let i = 0; i <= lenA; i++) {
    d[i + 1][0] = maxDist;
    d[i + 1][1] = i;
  }
  for (let j = 0; j <= lenB; j++) {
    d[0][j + 1] = maxDist;
    d[1][j + 1] = j;
  }

  const lastSeenInB: Record<string, number> = {};

  for (let i = 1; i <= lenA; i++) {
    let lastMatchCol = 0;
    for (let j = 1; j <= lenB; j++) {
      const i1 = lastSeenInB[b[j - 1]] ?? 0;
      const j1 = lastMatchCol;
      let cost = 1;
      if (a[i - 1] === b[j - 1]) {
        cost = 0;
        lastMatchCol = j;
      }
      d[i + 1][j + 1] = Math.min(
        d[i][j] + cost, // substitution (or match)
        d[i + 1][j] + 1, // insertion
        d[i][j + 1] + 1, // deletion
        d[i1][j1] + (i - i1 - 1) + 1 + (j - j1 - 1), // transposition
      );
    }
    lastSeenInB[a[i - 1]] = i;
  }

  return d[lenA + 1][lenB + 1];
}

function typoThresholdFor(guessLen: number, candidateLen: number): number {
  const len = Math.min(guessLen, candidateLen);
  if (len >= 10) return 2;
  if (len >= 5) return 1;
  return 0;
}

function acronymFor(words: string[]): string {
  return words
    .filter((w) => !ACRONYM_STOPWORDS.has(w))
    .map((w) => w[0])
    .join("");
}

export type LocalMatchResult = "correct" | "incorrect" | "ambiguous";

/**
 * Exact normalized match against title or any alias -> "correct". Small-typo
 * match -> "correct". Clearly unrelated -> "incorrect". Anything in between
 * (partial containment, word-subset overlap, moderate similarity, plausible
 * acronym) -> "ambiguous" so the LLM judge can decide. Empty/whitespace
 * guess -> "incorrect".
 */
export function matchGuessLocally(
  guess: string,
  title: string,
  aliases: string[],
): LocalMatchResult {
  const normGuess = normalizeGuess(guess);
  if (!normGuess) return "incorrect";

  const candidates = [title, ...aliases]
    .map(normalizeGuess)
    .filter((c) => c.length > 0);
  if (candidates.length === 0) return "incorrect";

  const guessWords = normGuess.split(" ").filter(Boolean);
  const guessWordSet = new Set(guessWords);

  let bestSignal: LocalMatchResult = "incorrect";

  for (const candidate of candidates) {
    if (normGuess === candidate) return "correct";

    const typoThreshold = typoThresholdFor(normGuess.length, candidate.length);
    if (typoThreshold > 0) {
      const distance = damerauLevenshtein(normGuess, candidate);
      if (distance <= typoThreshold) return "correct";
    }

    const candidateWords = candidate.split(" ").filter(Boolean);
    const candidateWordSet = new Set(candidateWords);

    // Partial containment (guard against trivially short substrings).
    const minLen = Math.min(normGuess.length, candidate.length);
    if (
      minLen >= 3 &&
      (candidate.includes(normGuess) || normGuess.includes(candidate))
    ) {
      bestSignal = "ambiguous";
      continue;
    }

    // Word-subset overlap: every word of the shorter side appears in the
    // longer side (e.g. guess "york city" vs title "new york city").
    const overlap = guessWords.filter(
      (w) => w.length >= 3 && candidateWordSet.has(w),
    );
    if (
      overlap.length > 0 &&
      (overlap.length === guessWordSet.size || overlap.length === candidateWordSet.size)
    ) {
      bestSignal = "ambiguous";
      continue;
    }

    // Plausible acronym (e.g. "nyc" vs "new york city").
    if (normGuess.length >= 2 && normGuess === acronymFor(candidateWords)) {
      bestSignal = "ambiguous";
      continue;
    }

    // Moderate overall similarity.
    const maxLen = Math.max(normGuess.length, candidate.length);
    if (maxLen > 0) {
      const distance = damerauLevenshtein(normGuess, candidate);
      const similarity = 1 - distance / maxLen;
      if (similarity >= 0.5) {
        bestSignal = "ambiguous";
      }
    }
  }

  return bestSignal;
}

/**
 * true if hintText contains title or any alias as a normalized substring —
 * used to reject leaking hints regardless of what any LLM concluded.
 * Answers whose normalized form is shorter than 3 chars are ignored (too
 * short to reliably signal a leak, e.g. would false-positive constantly).
 */
export function hintLeaksAnswer(
  hintText: string,
  title: string,
  aliases: string[],
): boolean {
  const normHint = normalizeGuess(hintText);
  if (!normHint) return false;

  const candidates = [title, ...aliases]
    .map(normalizeGuess)
    .filter((c) => c.length >= 3);

  return candidates.some((c) => normHint.includes(c));
}
