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
        urgent: { DEFAULT: token('urgent'), mark: token('urgent-mark'), wash: token('urgent-wash') },
        warn: { DEFAULT: token('warn'), mark: token('warn-mark'), wash: token('warn-wash') },
        ok: { DEFAULT: token('ok'), mark: token('ok-mark'), wash: token('ok-wash') },
        new: { DEFAULT: token('new'), mark: token('new-mark'), wash: token('new-wash') },
        info: { wash: token('info-wash') },
        slate: { DEFAULT: token('slate'), mark: token('slate-mark'), wash: token('slate-wash') },
        grey: token('grey'),
      },
      fontFamily: {
        sans: ['"Archivo Variable"', 'Archivo', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        label: ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.06em' }],
        meta: ['0.8125rem', { lineHeight: '1.125rem' }],
        figure: ['2.5rem', { lineHeight: '1', letterSpacing: '-0.01em' }],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        md: '10px',
        lg: '14px',
        xl: '18px',
      },
      boxShadow: {
        label: '0 1px 2px rgb(16 38 90 / 0.04), 0 4px 14px -6px rgb(16 38 90 / 0.10)',
        lift: '0 8px 22px -8px rgb(16 38 90 / 0.22), 0 2px 4px rgb(16 38 90 / 0.06)',
        dialog: '0 24px 56px -14px rgb(16 38 90 / 0.38), 0 4px 12px rgb(16 38 90 / 0.08)',
        fab: '0 8px 20px -4px rgb(31 86 208 / 0.55), 0 2px 6px rgb(16 38 90 / 0.18)',
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
