import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Workspace packages ship TypeScript source
  transpilePackages: [
    "@neobridge/tokens",
    "@neobridge/ble-protocol",
    "@neobridge/demo",
    "@neobridge/i18n",
  ],
};

export default nextConfig;
