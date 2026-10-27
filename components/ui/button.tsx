import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "teal";
  size?: "default" | "large";
};

// shadcn style, hand built: same look and API shape, no Radix dependency,
// so the Leaflet map and the Next.js build stay stable.
export function Button({ variant = "primary", size = "default", className = "", ...props }: Props) {
  const base = "gr-btn";
  const v = variant === "primary" ? "gr-btn-primary" : variant === "outline" ? "gr-btn-outline" : variant === "teal" ? "gr-btn-teal" : "gr-btn-ghost";
  const s = size === "large" ? "gr-btn-large" : "";
  return <button className={`${base} ${v} ${s} ${className}`.trim()} {...props} />;
}
