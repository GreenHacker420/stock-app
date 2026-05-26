/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.tsx", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#17211b",
        field: "#f6f7f2",
        line: "#d9dfd2",
        mint: "#2f7d5c",
        amber: "#b7791f",
        danger: "#b42318",
      },
    },
  },
  plugins: [],
};
