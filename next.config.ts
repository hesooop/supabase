import type { NextConfig } from "next";

const proxyTarget = process.env.SUPABASE_PROXY_TARGET;

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return proxyTarget ? [{ source: "/supabase/:path*", destination: `${proxyTarget}/:path*` }] : [];
  },
};

export default nextConfig;
