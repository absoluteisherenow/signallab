import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'night-black': '#070706',
        'night-silver': '#f0ebe2',
        'night-gray': '#0e0d0b',
        'night-dark-gray': '#2e2c29',
        'night-light': '#f0ebe2',
        'night-gold': '#b08d57',
        'night-dim': '#52504c',
      },
      fontFamily: {
        sans: ['DM Mono', 'monospace'],
        mono: ['DM Mono', 'monospace'],
        display: ['Unbounded', 'sans-serif'],
        serif: ['Libre Baskerville', 'Georgia', 'serif'],
      },
      spacing: { '18': '4.5rem' },
    },
  },
  plugins: [],
}
export default config
