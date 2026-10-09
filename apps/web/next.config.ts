import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ['@rivetrun/contracts', '@rivetrun/sim', '@rivetrun/brain', '@rivetrun/db'],
  // The floating dev badge covers the Brain HUD on a phone-sized screen.
  devIndicators: false,
};

export default nextConfig;
