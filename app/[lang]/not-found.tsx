import Link from "next/link";
import { lang as rootLang } from "next/root-params";
import AppNav from "../../components/AppNav";
import { isLang, localePath } from "../../lib/i18n";

const T = {
  en: { title: "Page not found", text: "This page does not exist. It may have moved.", back: "Back to the route map" },
  de: { title: "Seite nicht gefunden", text: "Diese Seite gibt es nicht. Vielleicht ist sie umgezogen.", back: "Zurück zur Routenkarte" },
};

export default async function NotFound() {
  const raw = await rootLang();
  const lang = isLang(raw) ? raw : "en";
  const t = T[lang];
  return (
    <div className="page">
      <AppNav />
      <main className="wrap">
        <section className="hero">
          <h1>{t.title}</h1>
          <p>{t.text}</p>
          <p className="back-link">
            <Link href={localePath(lang, "/")}>{t.back}</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
