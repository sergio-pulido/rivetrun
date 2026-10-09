import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `pnpm demo` builds into its own directory so it never touches the dev server's .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ['@rivetrun/contracts', '@rivetrun/sim', '@rivetrun/brain', '@rivetrun/db'],
  // The floating dev badge covers the Brain HUD on a phone-sized screen.
  devIndicators: false,
  // Phones on the LAN (and the demo tunnel) load dev assets cross-origin; Next 16 blocks that unless listed.
  allowedDevOrigins: ['10.194.73.231', '*.local', '*.trycloudflare.com'],
};

export default nextConfig;
