/** @type {import('tailwindcss').Config} */
const nativewind = require('nativewind/preset')

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [nativewind],
  theme: {
    extend: {
      colors: {
        brand: {
          background: '#050914',
          surface: '#10172b',
          primary: '#2663FF',
          accent: '#00D6B9',
          muted: '#94A3B8',
        },
      },
      borderRadius: {
        xl: '28px',
      },
      boxShadow: {
        card: '0 25px 60px rgba(15, 23, 42, 0.55)',
      },
    },
  },
  plugins: [],
}
