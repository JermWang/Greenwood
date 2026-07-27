import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dimmed neon, for secondary data (name kept for existing `amber-*` uses).
        amber: {
          100: '#f7ffd6',
          200: '#eeffa8',
          300: '#e2ff66',
          400: '#d7ff33',
          500: '#ccff00',
          600: '#a3cc00',
          700: '#7a9900',
        },
        // Robin Neon — the brand ramp. Always pairs with dark text.
        lime: {
          100: '#f7ffd6',
          200: '#eeffa8',
          300: '#e2ff66',
          400: '#d7ff33',
          500: '#ccff00',
          600: '#a3cc00',
          700: '#7a9900',
        },
        // Robin Black, warmed — the surface ramp.
        ink: {
          950: '#17160f',
          900: '#1d1c14',
          850: '#212018',
          800: '#24231a',
          750: '#333126',
          700: '#3d3b2e',
          600: '#54513f',
        },
        // Heather — the warm neutral ramp.
        steel: {
          100: '#f2f1f0',
          200: '#d4d2cf',
          300: '#b1afac',
          400: '#9a9894',
          500: '#82817d',
          600: '#5f5e5a',
        },
        emerald: {
          300: '#e2ff66',
          400: '#d7ff33',
          500: '#ccff00',
          600: '#a3cc00',
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
