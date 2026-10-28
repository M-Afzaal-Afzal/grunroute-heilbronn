import Link from "next/link";
import { LogoMark } from "./brand/Logo";

export default function SiteFooter() {
  return (
    <footer className="footer">
      <div className="footer-brand">
        <LogoMark size={36} tone="green" />
        <p>
          <b>GrünRoute Heilbronn</b>
          <span>Built for the Heilbronn Green City Hackathon, 27 to 29 Oct 2026.</span>
        </p>
      </div>
      <nav className="footer-links" aria-label="Footer">
        <Link href="/play">Hot or not?</Link>
        <Link href="/measure">Help measure</Link>
        <Link href="/districts">District league</Link>
        <Link href="/data-collection">How to collect data</Link>
      </nav>
      <p className="footer-fine">
        Map data from OpenStreetMap contributors. A screening tool, not a legal measurement. Your location stays on this phone.
      </p>
    </footer>
  );
}
