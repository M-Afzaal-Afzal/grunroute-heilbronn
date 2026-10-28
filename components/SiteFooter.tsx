"use client";
import Link from "next/link";
import { LogoMark } from "./brand/Logo";
import { useHref, useLang } from "./LangProvider";

const T = {
  en: {
    built: "Built for the Heilbronn Green City Hackathon, 27 to 29 Oct 2026.",
    play: "Hot or not?",
    measure: "Help measure",
    districts: "District league",
    collect: "How to collect data",
    footer: "Footer",
    fine: "Map data from OpenStreetMap contributors. A screening tool, not a legal measurement. Your location stays on this phone.",
  },
  de: {
    built: "Gebaut für den Heilbronn Green City Hackathon, 27. bis 29. Okt. 2026.",
    play: "Heiß oder nicht?",
    measure: "Mitmessen",
    districts: "Stadtteil-Liga",
    collect: "So sammelst du Daten",
    footer: "Fußzeile",
    fine: "Kartendaten von OpenStreetMap-Mitwirkenden. Ein Screening-Werkzeug, keine rechtliche Messung. Dein Standort bleibt auf diesem Handy.",
  },
};

export default function SiteFooter() {
  const t = T[useLang()];
  const href = useHref();
  return (
    <footer className="footer">
      <div className="footer-brand">
        <LogoMark size={36} tone="green" />
        <p>
          <b>GrünRoute Heilbronn</b>
          <span>{t.built}</span>
        </p>
      </div>
      <nav className="footer-links" aria-label={t.footer}>
        <Link href={href("/play")}>{t.play}</Link>
        <Link href={href("/measure")}>{t.measure}</Link>
        <Link href={href("/districts")}>{t.districts}</Link>
        <Link href={href("/data-collection")}>{t.collect}</Link>
      </nav>
      <p className="footer-fine">{t.fine}</p>
    </footer>
  );
}
