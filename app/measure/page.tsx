import type { Metadata } from "next";
import AppNav from "../../components/AppNav";
import SiteFooter from "../../components/SiteFooter";
import Measure from "../../components/Measure";

export const metadata: Metadata = {
  title: "Help measure, GrünRoute Heilbronn",
  description: "Short ride missions where Heilbronn has little bike sensor data. No sign up, nothing sent.",
};

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
