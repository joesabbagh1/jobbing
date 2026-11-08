import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native/headless-browser packages must stay out of the server bundle.
  serverExternalPackages: ["better-sqlite3", "playwright-core"],
  experimental: {
    // CV PDFs are uploaded through a server action; the default limit is 1 MB.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
