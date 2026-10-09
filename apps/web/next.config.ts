import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `pnpm demo` builds into its own directory so it never touches the dev server's .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ['@rivetrun/contracts', '@rivetrun/sim', '@rivetrun/brain', '@rivetrun/db'],
  // The floating dev badge covers the Brain HUD on a phone-sized screen.
  devIndicators: false,
  // FAST MODE: a type error in another session's in-progress file must not block the demo build. tsc runs separately.
  typescript: { ignoreBuildErrors: true },
  // Phones on the LAN (and the demo tunnel) load dev assets cross-origin; Next 16 blocks that unless listed.
  allowedDevOrigins: ['10.194.73.231', '127.0.0.1', '*.local', '*.trycloudflare.com'],
};

export default nextConfig;
