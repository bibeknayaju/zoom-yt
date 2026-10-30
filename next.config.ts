import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: "security",
  },
  async redirects() {
    return [
      {
        source: "/dashboard/zoom-youtube",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/dashboard/zoom-youtube/:path*",
        destination: "/dashboard/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
