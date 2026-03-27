/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bibelo: {
          bg: '#06090F',
          card: '#0F1419',
          border: '#1E2A3A',
          primary: '#8B5CF6',
          'primary-hover': '#7C3AED',
          accent: '#F472B6',
          text: '#E2E8F0',
          muted: '#64748B',
        },
      },
    },
  },
  plugins: [],
};
