import type { Metadata } from "next";

// The tab title, so several Planner tabs stay apart.
export const metadata: Metadata = { title: "Fix first" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
