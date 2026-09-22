import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  logging: { incomingRequests: { ignore: [/\/api\/connections\/youtube\/callback/] } },
};

export default nextConfig;
