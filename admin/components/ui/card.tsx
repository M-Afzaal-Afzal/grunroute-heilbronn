import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type CardProps = HTMLAttributes<HTMLDivElement> & { children: ReactNode };
type ClickableProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode };

// shadcn style Card. When onClick is given it renders a button, so a street
// card stays one large tap target (at least 44px tall) and keyboard focusable.
export function Card({ children, className = "", ...props }: CardProps) {
  return (
    <div className={`gr-card ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export function ClickableCard({ children, className = "", ...props }: ClickableProps) {
  return (
    <button type="button" className={`gr-card gr-card-clickable ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
