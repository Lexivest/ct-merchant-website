/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./*.html", "./src/**/*.{js,html}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      colors: {
        brand: {
          purple: '#2E1065',
          purpleLight: '#5B21B6',
          pink: '#DB2777',
          dark: '#0F172A',
          light: '#F8FAFC',
        },
      },
    },
  },
  plugins: [],
}
