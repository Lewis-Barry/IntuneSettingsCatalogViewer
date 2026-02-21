/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // For GitHub Pages deployment — set to your repo name
  basePath: '/IntuneSettingsCatalogViewer',
  assetPrefix: '/IntuneSettingsCatalogViewer/',
};

module.exports = nextConfig;
