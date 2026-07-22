import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        amber: {
          100: '#eef1ff',
          200: '#dce2ff',
          300: '#b8c2ff',
          400: '#8190ff',
          500: '#5b6cff',
          600: '#4655d9',
          700: '#3340a8',
        },
        lime: {
          100: '#efffd6',
          200: '#ddffab',
          300: '#c8ff72',
          400: '#b7ff4a',
          500: '#92e835',
          600: '#5fbe4d',
          700: '#3b8751',
        },
        ink: {
          950: '#040916',
          900: '#071224',
          850: '#0a172b',
          800: '#0d1b31',
          750: '#132744',
          700: '#1b3152',
          600: '#29466e',
        },
        steel: {
          100: '#eef7ff',
          200: '#d8e9f9',
          300: '#b8cee5',
          400: '#8da8c7',
          500: '#6885a8',
          600: '#456483',
        },
        emerald: {
          300: '#d3ff8b',
          400: '#b7ff4a',
          500: '#86e744',
          600: '#52bf7b',
        },
        rarity: {
          common: '#b8cee5',
          uncommon: '#77e788',
          rare: '#55bfff',
          epic: '#b37aff',
          legendary: '#ffcb52',
          mythic: '#ff628c',
          divine: '#ffffff',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
