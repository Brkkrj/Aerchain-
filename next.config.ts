import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse depends on pdfjs-dist (spawns its own internal worker) and @napi-rs/canvas (a
  // native binary addon) — bundling either one rewrites/tree-shakes paths their runtime module
  // resolution depends on, which silently breaks PDF text extraction (returns empty text rather
  // than throwing, unlike tesseract.js's equivalent worker_threads issue). Keeping them external
  // forces a plain runtime `require` against the real node_modules layout instead.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
