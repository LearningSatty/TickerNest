/** @type {import('tailwindcss').Config} */
//
// Theme tokens are exposed as CSS variables defined in index.css under the
// :root and [data-theme="light"] selectors.  This keeps Tailwind classes
// theme-agnostic — `bg-bg`, `text-ink`, `border-line` resolve to whatever
// the active theme defines.  Switching themes is a single DOM attribute
// flip; see ThemeProvider in src/lib/theme.tsx.
//
const cssVar = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: cssVar('--c-bg'),
          soft: cssVar('--c-bg-soft'),
          lift: cssVar('--c-bg-lift'),
        },
        ink: {
          DEFAULT: cssVar('--c-ink'),
          muted: cssVar('--c-ink-muted'),
          dim: cssVar('--c-ink-dim'),
        },
        accent: {
          DEFAULT: cssVar('--c-accent'),
          soft: cssVar('--c-accent-soft'),
        },
        gain: cssVar('--c-gain'),
        loss: cssVar('--c-loss'),
        flat: cssVar('--c-flat'),
        line: cssVar('--c-line'),
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
};
