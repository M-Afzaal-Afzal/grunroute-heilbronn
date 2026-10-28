import type { Metadata } from "next";
import AppNav from "../../components/AppNav";
import SiteFooter from "../../components/SiteFooter";
import Districts from "../../components/Districts";

export const metadata: Metadata = {
  title: "District league, GrünRoute Heilbronn",
  description: "How well each part of Heilbronn is measured, and how green its streets are. Data about streets, not people.",
};

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
