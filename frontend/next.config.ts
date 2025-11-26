import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  
  // @ts-ignore
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // @ts-ignore
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;