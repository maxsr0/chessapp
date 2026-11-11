import type { NextConfig } from "next";

// Served as a GitHub Pages project site at maxwellrobbins.com/chessapp.
// Set NEXT_PUBLIC_BASE_PATH="" to serve from the root (e.g. a plain `next dev`).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/chessapp";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath }, // lets client code build URLs for files in public/
  trailingSlash: true, // emit player/index.html so GitHub Pages serves /chessapp/player/
  images: { unoptimized: true },
  // cacheComponents / partialPrefetching imply PPR, which output: "export" doesn't support.
  // All data is fetched client-side anyway.
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
