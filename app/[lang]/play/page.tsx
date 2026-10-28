import type { Metadata } from "next";
import AppNav from "../../../components/AppNav";
import SiteFooter from "../../../components/SiteFooter";
import Play from "../../../components/Play";
import { isLang } from "../../../lib/i18n";
import { pageMetadata } from "../../../lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/play">): Promise<Metadata> {
  const { lang } = await params;
  return isLang(lang) ? pageMetadata(lang, "play") : {};
}

export default function PlayPage() {
  return (
    <div className="page">
      <AppNav />
      <Play />
      <div className="sub-foot">
        <SiteFooter />
      </div>
    </div>
  );
}
