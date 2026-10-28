"use client";
// EN and DE switch in the header. Links to the same page in the other
// language and keeps the choice in a cookie, so proxy.ts opens that language
// next time. The cookie holds only "en" or "de".
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "./LangProvider";
import { LANGS, LANG_NAME, localePath, type Lang } from "../lib/i18n";

const LABEL = { en: "Language", de: "Sprache" };

const remember = (lang: Lang) => {
  document.cookie = `lang=${lang}; path=/; max-age=31536000; samesite=lax`;
};

export default function LangSwitch() {
  const lang = useLang();
  const path = usePathname();
  return (
    <nav className="lang-switch" aria-label={LABEL[lang]}>
      {LANGS.map((l) => (
        <Link
          key={l}
          href={localePath(l, path)}
          hrefLang={l}
          lang={l}
          aria-label={LANG_NAME[l]}
          aria-current={l === lang ? "true" : undefined}
          onClick={() => remember(l)}
          prefetch={false}
        >
          {l.toUpperCase()}
        </Link>
      ))}
    </nav>
  );
}
