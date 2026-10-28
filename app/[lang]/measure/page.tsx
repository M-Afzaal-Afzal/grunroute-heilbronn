import type { Metadata } from "next";
import AppNav from "../../../components/AppNav";
import SiteFooter from "../../../components/SiteFooter";
import Measure from "../../../components/Measure";
import { isLang } from "../../../lib/i18n";
import { pageMetadata } from "../../../lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/measure">): Promise<Metadata> {
  const { lang } = await params;
  return isLang(lang) ? pageMetadata(lang, "measure") : {};
}

export default function MeasurePage() {
  return (
    <div className="page">
      <AppNav />
      <Measure />
      <div className="sub-foot">
        <SiteFooter />
      </div>
    </div>
  );
}
