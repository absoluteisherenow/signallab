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
        'night-black': '#0F0E0C',
        'night-silver': '#C0C0C0',
        'night-gray': '#1A1815',
        'night-dark-gray': '#2D2924',
        'night-light': '#E8E8E8',
      },
      fontFamily: {
        sans: ['system-ui', 'sans-serif'],
        mono: ['Fira Code', 'monospace'],
      },
      spacing: {
        '18': '4.5rem',
      },
    },
  },
  plugins: [],
}
export default config
