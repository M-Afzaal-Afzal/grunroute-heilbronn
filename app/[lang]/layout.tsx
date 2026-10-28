import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow-semi-condensed/700.css";
import "@fontsource/barlow-semi-condensed/800.css";
import "../globals.css";
import { LangProvider } from "../../components/LangProvider";
import { LANGS, SITE, SITE_NAME, isLang } from "../../lib/i18n";
import { PAGE_COPY, pageMetadata } from "../../lib/seo";

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  return {
    ...pageMetadata(lang, "home"),
    metadataBase: new URL(SITE),
    applicationName: SITE_NAME,
    title: { default: PAGE_COPY[lang].home.title, template: `%s | ${SITE_NAME}` },
    formatDetection: { telephone: false },
    appleWebApp: { capable: true, title: "GrünRoute", statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  themeColor: "#0F2A23",
};

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return (
    <html lang={lang}>
      <body>
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
