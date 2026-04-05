/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  swcMinify: true,
  // Static export for Tauri production builds (dev mode uses Next.js dev server)
  ...(process.env.TAURI_BUILD === '1' ? { output: 'export' } : {}),
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

module.exports = nextConfig;
