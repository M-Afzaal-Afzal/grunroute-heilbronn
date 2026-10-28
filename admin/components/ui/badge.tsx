import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  variant?: "default" | "secondary" | "outline" | "destructive" | "teal" | "heat";
  className?: string;
};

// shadcn style Badge, hand built.
export function Badge({ children, variant = "default", className = "" }: Props) {
  return <span className={`gr-badge gr-badge-${variant} ${className}`.trim()}>{children}</span>;
}
