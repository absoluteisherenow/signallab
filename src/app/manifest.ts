import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Signal Lab OS',
    short_name: 'Signal Lab OS',
    description: 'The operating system for electronic artists',
    start_url: '/',
    display: 'standalone',
    background_color: '#0F0E0C',
    theme_color: '#C0C0C0',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
