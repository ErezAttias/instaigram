import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Include font files in serverless function bundles so Sharp's SVG
  // renderer can embed them via fs.readFileSync at runtime.
  outputFileTracingIncludes: {
    "/api/**": [path.join(__dirname, "assets/fonts/**/*")],
  },
  // Disable client-side router cache so navigating back to a page
  // always shows the latest server-rendered content.
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
};

export default nextConfig;
