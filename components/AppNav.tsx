"use client";
// Slim header with the wordmark and the language switch, plus the app tabs:
// links in the header on wide screens, a bottom tab bar on phones.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./brand/Logo";
import LangSwitch from "./LangSwitch";
import { useHref, useLang } from "./LangProvider";
import { stripLang } from "../lib/i18n";

const TABS = [
  { href: "/", label: { en: "Route", de: "Route" }, icon: "M5 19c3-6 11-2 14-9M5 19a2 2 0 1 0 0-.01M19 10a2 2 0 1 0 0-.01" },
  { href: "/play", label: { en: "Hot or not", de: "Heiß oder nicht" }, icon: "M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z" },
  { href: "/measure", label: { en: "Help measure", de: "Mitmessen" }, icon: "M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10zM12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" },
  { href: "/districts", label: { en: "Districts", de: "Stadtteile" }, icon: "M4 20V10l5-3v13M9 20V5l6 3v12M15 20V9l5-2v13M3 20h18" },
] as const;

const MAIN = { en: "Main", de: "Hauptmenü" };

export default function AppNav() {
  const lang = useLang();
  const href = useHref();
  const path = stripLang(usePathname());
  const current = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <>
      <header className="topbar app-top">
        <Wordmark href={href("/")} lang={lang} />
        <nav className="top-tabs" aria-label={MAIN[lang]}>
          {TABS.map((t) => (
            <Link key={t.href} href={href(t.href)} aria-current={current(t.href) ? "page" : undefined}>
              {t.label[lang]}
            </Link>
          ))}
        </nav>
        <LangSwitch />
      </header>
      <nav className="tabbar" aria-label={MAIN[lang]}>
        {TABS.map((t) => (
          <Link key={t.href} href={href(t.href)} aria-current={current(t.href) ? "page" : undefined}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d={t.icon} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.label[lang]}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
