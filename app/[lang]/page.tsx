import type { Metadata } from "next";
import QRCode from "qrcode";
import Home from "../../components/Home";
import { SITE, SITE_NAME, isLang, localePath } from "../../lib/i18n";
import { PAGE_COPY, pageMetadata } from "../../lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  return isLang(lang) ? pageMetadata(lang, "home") : {};
}

// The QR code for fair mode is made at build time, so no QR library ships to the browser.
export default async function Page({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  const l = isLang(lang) ? lang : "en";
  const url = SITE + (localePath(l, "/") === "/" ? "" : localePath(l, "/"));
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#0F2A23ff", light: "#ffffffff" } });
  // Structured data for search engines: a free web app, no sign up.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url,
    description: PAGE_COPY[l].home.description,
    inLanguage: l,
    applicationCategory: "TravelApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    areaServed: { "@type": "City", name: "Heilbronn" },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Home qr={qr} />
    </>
  );
}
