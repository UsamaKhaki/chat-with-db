import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // libpg-query loads its .wasm file from its own package directory at
  // runtime, so it has to stay a plain node_modules dependency.
  serverExternalPackages: ["libpg-query"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
