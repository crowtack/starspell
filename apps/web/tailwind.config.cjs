module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}', '../../packages/shared/src/**/*.{js,ts}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
