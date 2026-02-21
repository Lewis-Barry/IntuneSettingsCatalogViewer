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
        // Fluent UI-inspired palette
        fluent: {
          blue: '#0078d4',
          'blue-hover': '#106ebe',
          'blue-pressed': '#005a9e',
          'light-blue': '#deecf9',
          'bg': '#faf9f8',
          'bg-alt': '#f3f2f1',
          'border': '#edebe9',
          'border-strong': '#8a8886',
          'text': '#323130',
          'text-secondary': '#605e5c',
          'text-disabled': '#a19f9d',
          'success': '#107c10',
          'warning': '#ffb900',
          'error': '#d13438',
          'info': '#0078d4',
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
