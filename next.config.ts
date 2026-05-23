import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/bern",
        destination: "/rooms/switzerland/bern",
        permanent: false,
      },
      {
        source: "/map",
        destination: "/rooms/switzerland/bern",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
