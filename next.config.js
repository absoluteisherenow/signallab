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
  // Legacy route aliases — nav rationalisation moved Ads/Growth/Automations
  // from /broadcast/* to /grow/*, and Plan collapses old Ideas+Strategy
  // routes. We handle the redirects here (instead of page.tsx redirect()
  // stubs) so Next's dev overlay doesn't flag NEXT_REDIRECT "errors" on
  // every hit — these fire at the middleware layer, invisibly.
  async redirects() {
    return [
      { source: '/broadcast/ads', destination: '/grow/ads', permanent: false },
      { source: '/broadcast/ads/:path*', destination: '/grow/ads/:path*', permanent: false },
      { source: '/broadcast/growth', destination: '/grow/growth', permanent: false },
      { source: '/broadcast/automations', destination: '/grow/automations', permanent: false },
      { source: '/broadcast/plan', destination: '/broadcast/ideas', permanent: false },
      { source: '/grow', destination: '/grow/growth', permanent: false },
    ]
  },
};

module.exports = nextConfig;
