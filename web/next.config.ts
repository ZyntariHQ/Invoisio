import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/invoice/:id",
        destination: "/invoices/:id",
        permanent: false,
      },
      {
        source: "/payment/:id",
        destination: "/pay/:id",
        permanent: false,
      },
      {
        source: "/receipt/:id",
        destination: "/invoices/:id",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
