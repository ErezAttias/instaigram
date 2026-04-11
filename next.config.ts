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
  // Prevent browsers and CDN from caching HTML pages — ensures users
  // always get the latest deployed version without hard refresh.
  headers: async () => [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      headers: [
        {
          key: "Cache-Control",
          value: "no-store, must-revalidate",
        },
      ],
    },
  ],
};

export default nextConfig;
