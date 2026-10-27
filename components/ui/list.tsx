import type { HTMLAttributes, ReactNode } from "react";

type ListProps = HTMLAttributes<HTMLUListElement> & { children: ReactNode };
type ItemProps = HTMLAttributes<HTMLLIElement> & { children: ReactNode; active?: boolean };
type ContentProps = HTMLAttributes<HTMLDivElement> & { children: ReactNode };

// shadcn style List, hand built in the same look and API shape.
// Clean separated rows, hover state, keyboard focus ring via focus-within,
// consistent padding, and a leading rank element supplied by the caller.
// The list itself is not a button, so action buttons inside an item stay
// valid and keyboard focusable, and the map stays visible on phones.
export function List({ children, className = "", ...props }: ListProps) {
  return (
    <ul className={`gr-list ${className}`.trim()} {...props}>
      {children}
    </ul>
  );
}

export function ListItem({ children, className = "", active = false, ...props }: ItemProps) {
  return (
    <li className={`gr-list-item ${active ? "active" : ""} ${className}`.trim()} {...props}>
      {children}
    </li>
  );
}

export function ListItemContent({ children, className = "", ...props }: ContentProps) {
  return (
    <div className={`gr-list-content ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
