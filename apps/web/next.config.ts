import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@vf/shared", "@vf/cv", "geist"],
};

export default nextConfig;
