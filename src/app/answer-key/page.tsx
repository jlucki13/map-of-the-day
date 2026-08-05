import { notFound } from "next/navigation";
import type { Metadata } from "next";
import staticMaps from "@/data/static-maps.json";
import { isAnswerKeyEnabled, isUnlocked } from "@/lib/answerKeyAuth";
import { lockAnswerKey } from "./actions";
import AnswerKeyList, { type AnswerKeyEntry } from "./AnswerKeyList";
import UnlockForm from "./UnlockForm";

export const runtime = "nodejs";
// Never cached or prerendered: the output depends on a cookie, and a cached
// copy of this page is a copy of every answer.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Answer key",
  robots: { index: false, follow: false, nocache: true },
};

interface StaticMapRecord {
  externalId: string;
  form?: string;
  title: string;
  aliases: string[];
  description: string;
  imageUrl: string;
  width?: number;
  height?: number;
  preauthoredHints: string[];
  preauthoredRedactionRegions?: {
    kind: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
}

function toEntries(): AnswerKeyEntry[] {
  return (staticMaps as StaticMapRecord[])
    .map((m) => {
      const id = m.externalId.replace(/^static:/, "");
      return {
        id,
        scope: id.startsWith("world-") ? ("world" as const) : ("us" as const),
        form: m.form ?? "choropleth",
        title: m.title,
        aliases: m.aliases,
        hints: m.preauthoredHints ?? [],
        description: m.description,
        imageUrl: m.imageUrl,
        width: m.width ?? 0,
        height: m.height ?? 0,
        regions: m.preauthoredRedactionRegions ?? [],
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export default async function AnswerKeyPage() {
  // Not configured means not present. Rendering a login box here would
  // advertise a door that cannot be opened.
  if (!isAnswerKeyEnabled()) notFound();

  if (!(await isUnlocked())) {
    return (
      <main className="mx-auto w-full max-w-[76rem] px-4 pb-16 sm:px-8">
        <UnlockForm />
      </main>
    );
  }

  const entries = toEntries();
  const usCount = entries.filter((e) => e.scope === "us").length;

  return (
    <main className="mx-auto w-full max-w-[76rem] px-4 pb-16 pt-8 sm:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="font-display text-3xl tracking-tight text-ink sm:text-4xl">
          Answer key
        </h1>
        <form action={lockAnswerKey}>
          <button
            type="submit"
            className="rounded-control border border-sand-300 bg-surface px-3 py-2 text-sm font-semibold text-ink-muted transition hover:border-ocean-600 hover:text-ink"
          >
            Lock again
          </button>
        </form>
      </div>

      <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed text-ink-muted">
        Every map in the rotation: {entries.length} in total, {usCount} of the
        United States and {entries.length - usCount} of the world. The chips
        under each map are the answers a guess is matched against.
      </p>

      {/* What "accepted" actually means, since the alias list alone
          overstates how strict the game is. */}
      <div className="mt-6 rounded-panel border border-hairline bg-surface-raised p-5 text-[14px] leading-relaxed text-ink-muted">
        <p className="font-semibold text-ink">How a guess is judged</p>
        <p className="mt-2">
          A guess is compared against the title and every chip below it, after
          both are lowercased, stripped of accents and punctuation, and shorn of
          a leading &ldquo;the&rdquo;/&ldquo;a&rdquo;. An exact match counts,
          and so does a near miss: one typo on a 5-character answer, two on
          anything 10 or longer.
        </p>
        <p className="mt-2">
          Looser resemblance &mdash; a guess contained in an answer, sharing all
          its words, or reading as its acronym &mdash; is not decided here. It
          is referred to the judge, which in production today is the offline
          matcher, since no{" "}
          <code className="rounded-chip bg-sand-100 px-1 py-0.5 font-mono text-[12px]">
            ANTHROPIC_API_KEY
          </code>{" "}
          is set. So the chips are the reliable answers; anything beyond them is
          a maybe.
        </p>
      </div>

      <AnswerKeyList entries={entries} />
    </main>
  );
}
