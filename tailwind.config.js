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
          DEFAULT: '#1B3A6B',
          dark: '#142d54',
          light: '#234a8a',
        },
        brand: {
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
