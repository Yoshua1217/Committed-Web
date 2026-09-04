import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // The draggable development toolbar currently throws releasePointerCapture
  // errors in Chromium. It is not part of the app, so keep it disabled.
  devIndicators: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
