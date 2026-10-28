import type { Metadata } from "next";
import DataCollection from "../../../components/DataCollection";
import { isLang } from "../../../lib/i18n";
import { pageMetadata } from "../../../lib/seo";

export async function generateMetadata({ params }: PageProps<"/[lang]/data-collection">): Promise<Metadata> {
  const { lang } = await params;
  return isLang(lang) ? pageMetadata(lang, "dataCollection") : {};
}

export default function DataCollectionPage() {
  return <DataCollection />;
}
