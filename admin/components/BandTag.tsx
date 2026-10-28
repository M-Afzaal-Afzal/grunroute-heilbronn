import { bandFor } from "@/lib/shared/data";

export function BandTag({ score }: { score: number | null }) {
  if (score == null) return <span className="pl-chip">Little data</span>;
  const b = bandFor(score);
  return (
    <span className="pl-band">
      <i style={{ background: b.color }} aria-hidden="true" />
      {b.label}
    </span>
  );
}
