import type { ReactNode } from "react";

// shadcn style bottom Sheet, hand built as a non modal peek sheet.
// Unlike a modal, it never covers the map with a backdrop and never blocks
// map interaction. On phones it peeks over the bottom of the sticky map;
// on desktop it is simply the side panel.
export function BottomSheet({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <aside className={`panel sheet ${className}`.trim()}>
      <div className="sheethandle" aria-hidden="true" />
      {children}
    </aside>
  );
}
