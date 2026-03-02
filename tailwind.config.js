/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Fluent UI-inspired palette — values driven by CSS variables for dark mode support
        fluent: {
          blue: 'var(--fluent-blue)',
          'blue-hover': 'var(--fluent-blue-hover)',
          'blue-pressed': 'var(--fluent-blue-pressed)',
          'light-blue': 'var(--fluent-light-blue)',
          'bg': 'var(--fluent-bg)',
          'bg-alt': 'var(--fluent-bg-alt)',
          'border': 'var(--fluent-border)',
          'border-strong': 'var(--fluent-border-strong)',
          'text': 'var(--fluent-text)',
          'text-secondary': 'var(--fluent-text-secondary)',
          'text-disabled': 'var(--fluent-text-disabled)',
          // success/error/warning use the rgb() + <alpha-value> format so that
          // opacity modifiers (e.g. bg-fluent-success/10) work correctly.
          'success': 'rgb(var(--fluent-success-rgb) / <alpha-value>)',
          'warning': 'rgb(var(--fluent-warning-rgb) / <alpha-value>)',
          'error': 'rgb(var(--fluent-error-rgb) / <alpha-value>)',
          'info': 'var(--fluent-info)',
        },
      },
      fontFamily: {
        sans: [
          '"Segoe UI"',
          '"Segoe UI Web (West European)"',
          '-apple-system',
          'BlinkMacSystemFont',
          'Roboto',
          '"Helvetica Neue"',
          'sans-serif',
        ],
      },
      fontSize: {
        'fluent-xs': ['11px', '14px'],
        'fluent-sm': ['12px', '16px'],
        'fluent-base': ['14px', '20px'],
        'fluent-lg': ['16px', '22px'],
        'fluent-xl': ['20px', '28px'],
        'fluent-2xl': ['24px', '32px'],
        'fluent-3xl': ['28px', '36px'],
      },
    },
  },
  plugins: [],
};
