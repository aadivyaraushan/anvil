import type { NextConfig } from "next";

// Conditional output mode:
// - `BUILD_TARGET=tauri` → static export for Tauri desktop shell (no SSR).
// - default → standard Next server build for Vercel (supports dynamic routes).
const isTauri = process.env.BUILD_TARGET === "tauri";

const nextConfig: NextConfig = {
  ...(isTauri ? { output: "export" as const, trailingSlash: true } : {}),
  images: { unoptimized: true },
};

export default nextConfig;
