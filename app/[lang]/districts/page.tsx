import type { Metadata } from "next";
import AppNav from "../../../components/AppNav";
import SiteFooter from "../../../components/SiteFooter";
import Districts from "../../../components/Districts";
import { isLang } from "../../../lib/i18n";
import { pageMetadata } from "../../../lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/districts">): Promise<Metadata> {
  const { lang } = await params;
  return isLang(lang) ? pageMetadata(lang, "districts") : {};
}

export default function DistrictsPage() {
  return (
    <div className="page">
      <AppNav />
      <Districts />
      <div className="sub-foot">
        <SiteFooter />
      </div>
    </div>
  );
}
