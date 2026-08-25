/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  // Without root, Turbopack walks up and finds a stray parent lockfile.
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
