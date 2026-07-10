/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      keyframes: {
        pop: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "40%": { transform: "scale(1.15)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "popup-rise": {
          "0%": { transform: "translateY(6px) scale(0.85)", opacity: "0" },
          "15%": { transform: "translateY(0) scale(1.05)", opacity: "1" },
          "75%": { transform: "translateY(-6px) scale(1)", opacity: "1" },
          "100%": { transform: "translateY(-18px) scale(1)", opacity: "0" },
        },
        "flash-fade": {
          "0%": { opacity: "0.9" },
          "100%": { opacity: "0" },
        },
        "countdown-pulse": {
          "0%": { transform: "scale(1.4)", opacity: "0" },
          "30%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(0.85)", opacity: "0" },
        },
      },
      animation: {
        pop: "pop 260ms ease-out",
        "popup-rise": "popup-rise 1100ms ease-out forwards",
        "flash-fade": "flash-fade 300ms ease-out forwards",
        "countdown-pulse": "countdown-pulse 1000ms ease-out",
      },
    },
  },
  plugins: [],
};
