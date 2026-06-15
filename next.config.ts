import type { NextConfig } from "next";

const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

const nextConfig: NextConfig = {
  ...(isCapacitorBuild
    ? {
        output: "export",
        trailingSlash: true,
        images: {
          unoptimized: true,
        },
      }
    : {}),
  ...(!isCapacitorBuild
    ? {
        async redirects() {
          return [
            {
              source: "/bern",
              destination: "/visit?tab=map",
              permanent: false,
            },
            {
              source: "/map",
              destination: "/visit?tab=map",
              permanent: false,
            },
            {
              source: "/rooms",
              destination: "/visit",
              permanent: false,
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
