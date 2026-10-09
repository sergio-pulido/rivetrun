import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ['@rivetrun/contracts', '@rivetrun/sim', '@rivetrun/brain', '@rivetrun/db'],
};

export default nextConfig;
