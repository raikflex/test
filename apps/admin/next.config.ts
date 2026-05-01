import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mesaya/database', '@mesaya/ui'],
  typedRoutes: true,
};

export default nextConfig;