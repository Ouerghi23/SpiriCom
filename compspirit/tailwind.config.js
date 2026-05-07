export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        huawei:  { DEFAULT: '#CF0A2C', dark: '#8B0000', light: '#FDE8EC' },
        ooredoo: { DEFAULT: '#E30613' },
        navy:    { DEFAULT: '#1C1C2E', light: '#2D2D4E' },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}