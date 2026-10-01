import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f4f7fb",
          100: "#e8eef7",
          200: "#c9d6ea",
          300: "#9bb0d0",
          400: "#6b86b3",
          500: "#4a6796",
          600: "#384f78",
          700: "#2c3e5c",
          800: "#1e2b42",
          900: "#141c2c",
          950: "#0b111c",
        },
        accent: {
          DEFAULT: "#6ee7b7",
          dim: "#34d399",
          glow: "#a7f3d0",
          soft: "#059669",
        },
        ember: { DEFAULT: "#fbbf24", soft: "#f59e0b" },
        mint: { DEFAULT: "#34d399", soft: "#10b981" },
        rose: { DEFAULT: "#fb7185" },
        warn: "#fbbf24",
        danger: "#f87171",
      },
      boxShadow: {
        glow: "0 0 40px rgba(110, 231, 183, 0.15)",
      },
      keyframes: {
        "pulse-line": {
          "0%, 100%": { opacity: "0.35", strokeDashoffset: "24" },
          "50%": { opacity: "1", strokeDashoffset: "0" },
        },
        "table-pop": {
          "0%": { transform: "scale(0.96)", boxShadow: "0 0 0 rgba(110,231,183,0)" },
          "50%": { transform: "scale(1.02)", boxShadow: "0 0 24px rgba(110,231,183,0.35)" },
          "100%": { transform: "scale(1)", boxShadow: "0 0 12px rgba(110,231,183,0.2)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(110,231,183,0.5)" },
          "50%": { boxShadow: "0 0 24px 4px rgba(110,231,183,0.35)" },
        },
        highlightFlash: {
          "0%, 100%": { backgroundColor: "transparent" },
          "40%": { backgroundColor: "rgba(251, 191, 36, 0.25)" },
        },
      },
      animation: {
        "pulse-line": "pulse-line 1.2s ease-in-out infinite",
        "table-pop": "table-pop 0.9s ease-out",
        "fade-up": "fade-up 0.35s ease-out",
        pulseGlow: "pulseGlow 1.4s ease-in-out infinite",
        highlightFlash: "highlightFlash 1.2s ease-in-out",
        fadeSlide: "fade-up 0.35s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
