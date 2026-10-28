import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "City planning view, GrünRoute Heilbronn",
  description: "Ranked street issues for Heilbronn from ATRAI bike sensors, heat walks, and the city tree register, with suggested quick fixes. A screening tool for planners.",
};

export default function CityLayout({ children }: { children: React.ReactNode }) {
  return children;
}
