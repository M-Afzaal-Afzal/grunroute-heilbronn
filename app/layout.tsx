import type { Metadata, Viewport } from "next";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow-semi-condensed/700.css";
import "@fontsource/barlow-semi-condensed/800.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://grunroute-heilbronn-ebon.vercel.app"),
  title: "GrünRoute Heilbronn: find a cooler, safer way through Heilbronn",
  description:
    "Cooler, cleaner, and safer routes through Heilbronn, from real bike, tree, and heat data. No app, no sign up, no personal tracking.",
  openGraph: {
    title: "GrünRoute Heilbronn",
    description: "Find a cooler, safer way through Heilbronn. Cooler, cleaner, and safer streets for Heilbronn.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F2A23",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
