/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          purple: "#6D28D9",
          pink: "#EC4899",
          yellow: "#FBBF24",
          teal: "#14B8A6",
        },
      },
      fontFamily: {
        display: ["Poppins", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
