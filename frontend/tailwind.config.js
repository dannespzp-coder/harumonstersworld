/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        gold: '#C9A84C',
        'gold-dim': '#8B6E2E',
        dark: '#0A0A0F',
        dark2: '#0F0F18',
        dark3: '#151520',
        dtext: '#D4C5A9',
        'dtext-dim': '#7A6E5A',
        'dtext-bright': '#F0E6CC',
      },
      fontFamily: {
        cinzel: ['"Cinzel"', 'serif'],
        'cinzel-deco': ['"Cinzel Decorative"', 'serif'],
        crimson: ['"Crimson Pro"', 'serif'],
      },
      animation: {
        'pulse-gold': 'pulse-gold 2s ease-in-out infinite',
        breathe: 'breathe 3s ease-in-out infinite',
      },
      keyframes: {
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(201,168,76,0.5)' },
          '50%':       { boxShadow: '0 0 0 6px rgba(201,168,76,0)' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%':      { transform: 'scale(1.05)' },
        },
      },
    },
  },
  plugins: [],
}
