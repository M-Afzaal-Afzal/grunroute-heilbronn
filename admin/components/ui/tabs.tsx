import type { ReactNode } from "react";

type Option = { value: string; label: string; hint?: string };
type Props = {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  label: string;
};

// shadcn style segmented control, hand built: two large buttons, no popup,
// so the For the city / For people switch is the one primary action.
export function SegmentedTabs({ value, options, onChange, label }: Props) {
  return (
    <nav className="tabs" role="tablist" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          className={value === opt.value ? "active" : ""}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
          {opt.hint ? <small>{opt.hint}</small> : null}
        </button>
      ))}
    </nav>
  );
}

export function TabPanel({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
