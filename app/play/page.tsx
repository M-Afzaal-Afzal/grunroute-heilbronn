import type { Metadata } from "next";
import AppNav from "../../components/AppNav";
import SiteFooter from "../../components/SiteFooter";
import Play from "../../components/Play";

export const metadata: Metadata = {
  title: "Hot or not? GrünRoute Heilbronn",
  description: "Two real spots from the Heilbronn summer heat walks. Guess which one was warmer.",
};

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
