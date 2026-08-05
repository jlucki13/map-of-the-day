# Map of the Day

A Wordle-style daily game: once per configurable interval (default 24h) the
site publishes one **thematic data map** — a choropleth, a graduated-symbol
map, a dot-density map, a categorical class map, a tile cartogram, a point
map, a flow map or a bivariate map of states or countries — with its **title
redacted**, and everyone guesses **what the map is depicting** (the variable
being visualized, e.g.
"population by state" or "highest elevation"). The color scale stays visible
as a clue; the words that name the topic don't. 5 guesses; a hint unlocks
after the 3rd and 4th wrong guess; the answer, description, and source
attribution are revealed when the round ends. A win earns points based on how
many guesses it took (10/8/5/2/1 for guess 1–5), tracked cumulatively on an
all-time leaderboard (`/leaderboard`) once you set a nickname — prompted
inline on your first win. A first-visit popup explains the rules (reopenable
anytime via the "?" button).

The backend actually runs a small multi-agent Claude pipeline at
map-generation time (source/vet a candidate map, find and redact its
title/legend text, write the two hints) plus one fast sub-agent call live on
ambiguous guesses (fuzzy correctness judging).

## Quick start (mock mode — zero configuration)

```bash
npm install
npm run dev
```

With no `ANTHROPIC_API_KEY` set, the app runs in **mock mode**: the
self-generated thematic dataset (`src/data/static-maps.json` +
`public/generated-maps/*.png`) supplies the puzzle, agents are deterministic
stubs, game/session state lives in memory, and images are written to
`public/dev-blob/`. The full guess flow — hints, win/loss, reveal — works with
zero provisioned services.

Tip: set `PUZZLE_INTERVAL_SECONDS=300` in `.env` to watch rotation happen.

## Architecture

- **Next.js App Router (Node runtime)** — three API routes:
  - `GET /api/puzzle` — serves the current puzzle + this visitor's session.
    Checks staleness on every request; if stale, serves the existing puzzle
    immediately and regenerates in the background under a setNX lock. Only a
    true cold start blocks on generation. (Vercel cron is just a convenience
    trigger — rotation works without it.)
  - `POST /api/guess` — local normalizer first (`src/lib/guessMatch.ts`);
    only genuinely ambiguous guesses hit the Haiku judge. A judge *failure*
    returns 503 and does **not** consume a guess; a judged "incorrect" does.
  - `GET /api/cron/generate-puzzle` — `Bearer CRON_SECRET`-guarded proactive
    rotation (see `vercel.json`).
- **Agent pipeline** (`src/agents/`, plain-code workflow calling
  `@anthropic-ai/sdk` directly): Scout (Haiku) filters candidates and
  proposes aliases → Orchestrator (Fable 5) picks the best → tesseract.js OCR
  finds text geometry deterministically → Redactor (Haiku, vision) classifies
  blocks as title/legend/other → sharp composites the redaction → Hintsmith
  (Haiku) writes two hints → deterministic substring leak-check → Orchestrator
  (Fable 5) final QA on exactly what a player will see. Live sub-agents use
  structured outputs (`output_config.format`), Fable calls set the
  server-side fallback-to-Opus-4.8 beta and handle `refusal` stop reasons.
- **Sources** (`src/sources/`): a self-generated **thematic dataset** (65
  maps rendered by `scripts/generate-maps.mjs` from public-domain boundaries —
  US Census TIGER via `us-atlas`, Natural Earth via `world-atlas` — driven by
  real public statistics; CC0, self-hosted under `public/generated-maps/`).
  Sixteen cartographic forms are supported: sequential, diverging and classed
  choropleths; graduated symbols (at centroids or at true coordinates); seeded
  dot density; categorical/binary class maps; tile-grid cartograms; point
  maps; flow maps; bivariate choropleths; non-contiguous and Dorling
  cartograms; spike maps; three-way composition pies; and interpolated
  surfaces banded into zones. Class maps and composition maps carry a second
  preauthored redaction region over the legend's words so the swatches survive
  but the labels do not. Used in mock mode and as automatic fallback, plus
  the Wikimedia Commons live API retargeted to thematic-map categories (raster
  maps with complete license metadata, honest User-Agent per Wikimedia
  policy). Regenerate the dataset with `npm run generate:maps`. Dedupe against
  repeats is count-based (last 20 used).
- **Storage**: Upstash Redis (puzzle record, per-visitor sessions keyed by an
  httpOnly cookie, recent-history list) and Vercel Blob (redacted + original
  images). Both have local fallbacks (in-memory map / `public/dev-blob/`)
  that log loudly if ever active on Vercel.

### Anti-leak invariants (the important part)

- The title/aliases/description/attribution/original image are **never** sent
  to the client until that visitor's session is finished. All state lives
  server-side keyed by an httpOnly cookie.
- Exactly one function pair turns server state into client JSON:
  `toPublicPuzzleView` / `toPublicSessionView` in `src/lib/publicViews.ts`.
  Any route serializing a `Puzzle`/`GuessSessionState` directly is a bug.
- Hints get two independent safety nets: Fable's final QA **and** a
  deterministic substring check (`hintLeaksAnswer`) that rejects leaking
  hints regardless of what any LLM concluded.

## Deployment (Vercel)

1. Create the Vercel project from this repo (framework: Next.js).
2. Add a Redis integration (Storage tab) and Vercel Blob (`BLOB_READ_WRITE_TOKEN`).
   Vercel's Redis integration has provisioned env vars under different names
   at different times — sometimes `UPSTASH_REDIS_REST_URL/TOKEN`, sometimes
   `KV_REST_API_URL/TOKEN`. The app accepts either pair; just confirm
   whichever one your integration actually injected shows up under Project
   Settings → Environment Variables after connecting, and **redeploy** —
   connecting the integration doesn't retroactively affect an
   already-running deployment.
3. Set `ANTHROPIC_API_KEY` and `CRON_SECRET` (see `.env.example` for all
   variables, including `WIKIMEDIA_USER_AGENT` — set it to your real site
   URL/contact). Leave `ANTHROPIC_API_KEY` unset until you've confirmed the
   data-retention requirement below — the app runs correctly in mock mode
   without it, on real storage.
4. **Anthropic account requirement:** Claude Fable 5 requires 30-day-minimum
   data retention on your Anthropic organization (it is unavailable under
   zero-data-retention). Confirm in the Anthropic Console before relying on
   the live pipeline.
5. Recommended: run one manual round against the live path
   (`curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/generate-puzzle`)
   on a preview deploy — the live Wikimedia + OCR + Fable path is exactly
   what mock mode cannot prove. Also verify sharp/tesseract on a real deploy
   (both have Vercel-specific bundling handled in `next.config.js`;
   `tessdata/eng.traineddata` is vendored so tesseract never fetches from a
   CDN).

## Scripts

- `npm run dev` — dev server (mock mode with no env vars)
- `npm run build` / `npm start` — production build/serve
- `npm run typecheck` — `tsc --noEmit`

## Out of scope for v1

Past-puzzle archive (old images are deleted on rotation to bound storage),
user accounts, per-IP rate limiting, additional map sources. The
`MapSource` interface and clean contracts make these straightforward
follow-ups.
