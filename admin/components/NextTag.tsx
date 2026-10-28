import { NEXT_COLOR, NEXT_LABEL, type NextStep } from "@/lib/actions";

export function NextTag({ step }: { step: NextStep | null }) {
  if (!step) return <span className="pl-chip">Little data</span>;
  return (
    <span className="pl-band">
      <i style={step === "check" ? { border: `2px dashed ${NEXT_COLOR[step]}`, background: "transparent" } : { background: NEXT_COLOR[step] }} aria-hidden="true" />
      {NEXT_LABEL[step]}
    </span>
  );
}
