import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GrünRoute Heilbronn",
    short_name: "GrünRoute",
    description: "Which street should Heilbronn fix first? Cooler, cleaner, and safer streets for Heilbronn.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F7F5",
    theme_color: "#0F2A23",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
