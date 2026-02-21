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
};

module.exports = nextConfig;
