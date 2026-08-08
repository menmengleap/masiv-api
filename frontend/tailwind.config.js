/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark SaaS surface scale
        ink: {
          950: '#080808',
          900: '#0d0d0f',
          850: '#131316',
          800: '#18181c',
          750: '#1e1e23',
          700: '#26262c',
          600: '#33333b',
        },
        brand: {
          DEFAULT: '#ff7a1a',
          50: '#fff3e9',
          100: '#ffe0c4',
          400: '#ff9640',
          500: '#ff7a1a',
          600: '#e8650b',
          700: '#bf4f05',
        },
        // Status colors
        ok: '#22c55e',
        warn: '#eab308',
        danger: '#ef4444',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};
