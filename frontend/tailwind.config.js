/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f5ff', 100: '#dbe6ff', 300: '#9db7ff', 500: '#4f7dff',
          600: '#3a63e0', 700: '#2c4cb3', 900: '#182a66',
        },
      },
      backdropBlur: { xs: '2px' },
    },
  },
  plugins: [],
};
