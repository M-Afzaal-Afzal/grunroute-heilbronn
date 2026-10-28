import type { MetadataRoute } from "next";

// Lets the Planner be installed as an app (demo). Icons are the Fix Point
// mark from the brand kit (brand/icons).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GrünRoute Planner",
    short_name: "GR Planner",
    description: "Screening tool for city staff: which Heilbronn streets to check and fix first. Demo, public data only.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F4F7F5",
    theme_color: "#0F2A23",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
