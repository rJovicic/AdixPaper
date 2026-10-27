/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ground: token('ground'),
        stock: token('stock'),
        ink: { DEFAULT: token('ink'), 2: token('ink-2'), 3: token('ink-3') },
        rule: { DEFAULT: token('rule'), strong: token('rule-strong') },
        brand: {
          DEFAULT: token('brand'),
          hover: token('brand-hover'),
          deep: token('brand-deep'),
          wash: token('brand-wash'),
          'on-deep': token('brand-on-deep'),
        },
        key: { DEFAULT: token('key'), 2: token('key-2') },
        // Process inks carry state: cyan new, yellow in progress / soon, magenta urgent / overdue.
        cyan: { DEFAULT: token('cyan-text'), mark: token('cyan'), wash: token('cyan-wash') },
        urgent: { DEFAULT: token('urgent'), mark: token('urgent-mark'), wash: token('urgent-wash') },
        warn: { DEFAULT: token('warn'), mark: token('warn-mark'), edge: token('warn-edge'), wash: token('warn-wash') },
        ok: { DEFAULT: token('ok'), mark: token('ok-mark'), wash: token('ok-wash') },
      },
      fontFamily: {
        sans: ['"Geist Variable"', 'Geist', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"Geist Mono Variable"', '"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        label: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
        meta: ['0.8125rem', { lineHeight: '1.125rem' }],
        figure: ['2.125rem', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '7px',
        lg: '10px',
      },
      boxShadow: {
        label: '0 1px 2px rgb(17 19 22 / 0.06), 0 8px 20px -14px rgb(17 19 22 / 0.25)',
        lift: '0 12px 28px -12px rgb(17 19 22 / 0.28), 0 2px 6px rgb(17 19 22 / 0.08)',
        dialog: '0 24px 56px -16px rgb(17 19 22 / 0.45), 0 4px 12px rgb(17 19 22 / 0.1)',
      },
      screens: {
        xs: '420px',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
