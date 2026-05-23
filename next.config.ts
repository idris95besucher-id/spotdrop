import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/bern",
        destination: "/map",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
