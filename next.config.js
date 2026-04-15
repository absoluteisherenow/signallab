/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  swcMinify: true,
  // Static export for Tauri production builds (dev mode uses Next.js dev server)
  // Standalone output for Cloudflare Workers (OpenNext) production builds
  ...(process.env.TAURI_BUILD === '1'
    ? { output: 'export' }
    : { output: 'standalone' }),
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

module.exports = nextConfig;
