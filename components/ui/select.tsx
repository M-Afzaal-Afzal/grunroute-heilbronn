import type { ReactNode, SelectHTMLAttributes } from "react";

type Props = SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode; label?: string; id: string };

// shadcn style Select, hand built on a native select for reliable mobile use.
export function Select({ children, label, id, className = "", ...props }: Props) {
  return (
    <div className="gr-field">
      {label ? (
        <label htmlFor={id} className="gr-label">
          {label}
        </label>
      ) : null}
      <select id={id} className={`gr-select ${className}`.trim()} {...props}>
        {children}
      </select>
    </div>
  );
}
