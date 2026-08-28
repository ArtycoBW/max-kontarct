import type { NextConfig } from "next";

const developmentApiTarget = "http://localhost:3001";

const nextConfig: NextConfig = {
  agentRules: false,
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
