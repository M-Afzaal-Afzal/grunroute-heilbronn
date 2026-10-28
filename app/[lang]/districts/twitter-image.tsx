import { OG_SIZE, OG_TYPE, ogAlt, ogImage } from "../../../lib/og";

// Share image for this page, in the page language.
export async function generateImageMetadata({ params }: { params: Promise<{ lang: string }> | { lang: string } }) {
  const { lang } = await params;
  return [{ id: "card", alt: ogAlt(lang, "districts"), size: OG_SIZE, contentType: OG_TYPE }];
}

export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  return ogImage((await params).lang, "districts");
}
