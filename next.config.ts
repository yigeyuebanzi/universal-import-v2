import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'exceljs',
    'postgres',
    'bullmq',
    'ioredis',
    'mammoth',
    'pdf-parse',
    'unzipper',
    'saxes',
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: '30mb',
    },
  },
};

export default nextConfig;
