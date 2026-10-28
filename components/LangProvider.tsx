"use client";
// Hands the page language to client components. The layout sets it from the
// [lang] route, so a component calls useLang() instead of reading the URL.
import { createContext, useCallback, useContext } from "react";
import { DEFAULT_LANG, localePath, type Lang } from "../lib/i18n";

const LangContext = createContext<Lang>(DEFAULT_LANG);

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

/** Returns a function that puts a path in the page language, for links. */
export function useHref() {
  const lang = useLang();
  return useCallback((path: string) => localePath(lang, path), [lang]);
}
