import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // `pg` opens TCP sockets; it cannot run on the edge runtime (R5).
  serverExternalPackages: ['pg'],
};

export default nextConfig;
