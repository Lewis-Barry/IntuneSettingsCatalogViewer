/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Custom domain (intunesettings.app) — no basePath needed
  basePath: '',
  assetPrefix: '',
  webpack: (config, { dev, isServer }) => {
    if (dev && isServer) {
      config.output.chunkFilename = '[name].js';
    }

    return config;
  },
};

module.exports = nextConfig;
