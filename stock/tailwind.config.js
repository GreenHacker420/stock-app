/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.tsx", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        field: "#ffffff",
        line: "#e5e7eb",
        primary: "#1e40af",
        background: "#f9fafb",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
      },
    },
  },
  plugins: [],
};
