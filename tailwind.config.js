/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      screens: {
        xs: '480px',
      },
      colors: {
        background: { DEFAULT: 'var(--background)' },
        foreground: { DEFAULT: 'var(--foreground)' },
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        indigo: {
          DEFAULT: 'var(--indigo)',
          foreground: 'var(--indigo-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        border: { DEFAULT: 'var(--border)' },
        input: { DEFAULT: 'var(--input)' },
        ring: { DEFAULT: 'var(--ring)' },

        /* ── Token ngữ nghĩa (Phase 1) — vai trò, không phải màu thô.
           Dark = ĐÚNG giá trị hardcode hiện tại ⇒ dark bất biến; light = palette đã tinh chỉnh.
           Sinh utility: bg-canvas, bg-surface, bg-surface-2, bg-hover,
           border-line / -subtle / -strong, text-ink / -muted / -faint. ── */
        canvas:  { DEFAULT: 'var(--canvas)' },
        surface: { DEFAULT: 'var(--surface)', 2: 'var(--surface-2)' },
        hover:   { DEFAULT: 'var(--hover)', strong: 'var(--hover-strong)' },
        line:    { DEFAULT: 'var(--line)', subtle: 'var(--line-subtle)', strong: 'var(--line-strong)' },
        ink:     { DEFAULT: 'var(--ink)', muted: 'var(--ink-muted)', faint: 'var(--ink-faint)', bright: 'var(--ink-bright)' },
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'calc(var(--radius) - 0.25rem)',
        md: 'var(--radius)',
        lg: 'calc(var(--radius) + 0.25rem)',
        xl: 'calc(var(--radius) + 0.5rem)',
        '2xl': 'calc(var(--radius) + 1rem)',
        '3xl': 'calc(var(--radius) + 1.5rem)',
      },
      fontFamily: {
        sans: ['var(--font-plus-jakarta-sans)', 'Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      boxShadow: {
        glow: 'var(--shadow-glow)',
        card: 'var(--shadow-card)',
        modal: 'var(--shadow-modal)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};