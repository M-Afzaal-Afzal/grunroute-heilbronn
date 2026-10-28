"use client";
// Screen-only bar above a print page: language switch and the print button.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { T, type Lang } from "@/lib/i18n";

export function PrintBar({ lang, back, note }: { lang: Lang; back: string; note?: string }) {
  const path = usePathname();
  const t = T[lang];
  return (
    <div className="pl-toolbar no-print">
      <Link className="pl-btn" href={back}>
        {t.back}
      </Link>
      <div className="pl-seg" role="group" aria-label="Language">
        <Link href={path} aria-current={lang === "de" ? "true" : undefined} className={lang === "de" ? "pl-seg-on" : ""}>
          Deutsch
        </Link>
        <Link href={`${path}?lang=en`} aria-current={lang === "en" ? "true" : undefined} className={lang === "en" ? "pl-seg-on" : ""}>
          English
        </Link>
      </div>
      <button type="button" className="pl-btn primary" onClick={() => window.print()}>
        {t.print}
      </button>
      {note && <span className="pl-note">{note}</span>}
    </div>
  );
}
