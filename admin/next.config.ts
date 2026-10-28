import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Planner: desktop tool for city staff. Reads the same data as the people app (scripts/sync-shared.mjs).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
