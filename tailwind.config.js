/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#1E2461',
          dark: '#161a4a',
          light: '#272e7a',
        },
        brand: {
          yellow: '#C8D42F',
          blue: '#2563EB',
          green: '#16A34A',
          amber: '#D97706',
          red: '#DC2626',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        card: '8px',
        btn: '6px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08)',
      }
    },
  },
  plugins: [],
}
