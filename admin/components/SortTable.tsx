"use client";
import { useMemo, useState, type ReactNode } from "react";

export type Column<T> = {
  key: string;
  label: string;
  num?: boolean;
  /** Value used for sorting. null sorts last. */
  sort?: (row: T) => number | string | null;
  render: (row: T) => ReactNode;
  title?: string;
};

type Props<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  initial?: { key: string; dir: "asc" | "desc" };
  onRowClick?: (row: T) => void;
  activeKey?: string | number | null;
  limit?: number;
  caption?: string;
  maxHeight?: number;
  /** Controlled sort, for URL state. */
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (s: { key: string; dir: "asc" | "desc" }) => void;
};

// Sortable table. Click a header to sort, click again to flip. Rows can be
// clicked or opened with Enter.
export function SortTable<T>({ columns, rows, rowKey, initial, onRowClick, activeKey, limit, caption, maxHeight, sort: ctrl, onSort }: Props<T>) {
  const [own, setOwn] = useState(initial ?? null);
  const sort = ctrl ?? own;
  const setSort = (s: { key: string; dir: "asc" | "desc" }) => (onSort ? onSort(s) : setOwn(s));
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!col?.sort || !sort) return rows;
    const get = col.sort;
    const dir = sort.dir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [rows, columns, sort]);
  const shown = limit ? sorted.slice(0, limit) : sorted;
  return (
    <div className="pl-table-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className="pl-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => {
              const on = sort?.key === c.key;
              return (
                <th key={c.key} className={c.num ? "n" : undefined} aria-sort={on ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined} title={c.title}>
                  {c.sort ? (
                    <button type="button" className="pl-sort" onClick={() => setSort({ key: c.key, dir: on && sort!.dir === "desc" ? "asc" : on ? "desc" : c.num ? "desc" : "asc" })}>
                      {c.label}
                      <span aria-hidden="true">{on ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const k = rowKey(r);
            return (
              <tr
                key={k}
                className={activeKey === k ? "is-active" : undefined}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(r) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                style={onRowClick ? { cursor: "pointer" } : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.num ? "n" : undefined}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            );
          })}
          {shown.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="pl-note">
                No rows match.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
