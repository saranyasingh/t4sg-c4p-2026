/** @type {import('next').NextConfig} */

import { loadMonorepoEnv } from "./load-root-env.mjs";

loadMonorepoEnv();

await import("./env.mjs");

const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
