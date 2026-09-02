import type { NextConfig } from "next";
import path from "node:path";

const developmentApiTarget = "http://localhost:3001";

const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  reactStrictMode: true,
  async rewrites() {
    const target =
      process.env.API_PROXY_TARGET ??
      (process.env.NODE_ENV === "development" ? developmentApiTarget : null);

    if (!target) {
      return [];
    }

    return [
      {
        destination: `${target.replace(/\/$/, "")}/api/:path*`,
        source: "/api/:path*",
      },
    ];
  },
};

export default nextConfig;
