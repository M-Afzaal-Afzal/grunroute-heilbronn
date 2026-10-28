"use client";
// Slim header with the wordmark, plus the app tabs: links in the header on
// wide screens, a bottom tab bar on phones.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./brand/Logo";

const TABS = [
  { href: "/", label: "Route", icon: "M5 19c3-6 11-2 14-9M5 19a2 2 0 1 0 0-.01M19 10a2 2 0 1 0 0-.01" },
  { href: "/play", label: "Hot or not", icon: "M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z" },
  { href: "/measure", label: "Help measure", icon: "M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" },
  { href: "/districts", label: "Districts", icon: "M4 20V10l5-3v13M9 20V5l6 3v12M15 20V9l5-2v13M3 20h18" },
] as const;

export default function AppNav() {
  const path = usePathname();
  const current = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <header className="topbar app-top">
        <Wordmark />
        <nav className="top-tabs" aria-label="Main">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} aria-current={current(t.href) ? "page" : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={current(t.href) ? "page" : undefined}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d={t.icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
