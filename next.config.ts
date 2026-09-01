import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Solari SDKs load a browser driver with Node native paths and non JS
  // assets, which the bundler cannot follow. They are required at runtime instead.
  serverExternalPackages: ["@solarisdk/browser", "@solarisdk/sandbox", "patchright-core", "patchright"],
};

export default nextConfig;
