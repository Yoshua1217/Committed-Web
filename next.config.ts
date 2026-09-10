import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_TEST_DIST_DIR || ".next",
  output: "export",
  // The draggable development toolbar currently throws releasePointerCapture
  // errors in Chromium. It is not part of the app, so keep it disabled.
  devIndicators: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
