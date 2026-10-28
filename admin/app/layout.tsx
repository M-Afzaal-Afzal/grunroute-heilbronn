import type { Metadata, Viewport } from "next";
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow/700.css";
import "@fontsource/barlow-semi-condensed/700.css";
import "@fontsource/barlow-semi-condensed/800.css";
import "./globals.css";
import { TopBar } from "@/components/shell/TopBar";
import { SideNav } from "@/components/shell/SideNav";

export const metadata: Metadata = {
  title: { default: "GrünRoute Planner", template: "%s · GrünRoute Planner" },
  description: "Screening tool for Heilbronn city staff: which streets to check and fix first. Built from open and hackathon data.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const viewport: Viewport = { themeColor: "#0F2A23" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TopBar />
        <div className="pl-shell">
          <SideNav />
          <main className="pl-main" id="main">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
