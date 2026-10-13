import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Every colour is a CSS variable (see globals.css: html.dark / html.light), so existing class
        // names keep working and both themes come from one set of tokens.
        ink: Object.fromEntries(
          ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"].map((k) => [k, `rgb(var(--ink-${k}) / <alpha-value>)`])
        ),
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          dim: "rgb(var(--accent-dim) / <alpha-value>)",
          glow: "rgb(var(--accent-glow) / <alpha-value>)",
          soft: "rgb(var(--accent-soft) / <alpha-value>)",
        },
        ember: { DEFAULT: "rgb(var(--warn) / <alpha-value>)", soft: "rgb(var(--warn) / <alpha-value>)" },
        mint: { DEFAULT: "rgb(var(--accent-dim) / <alpha-value>)", soft: "rgb(var(--accent-soft) / <alpha-value>)" },
        rose: { DEFAULT: "rgb(var(--danger) / <alpha-value>)" },
        warn: "rgb(var(--warn) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
        "on-accent": "rgb(var(--on-accent) / <alpha-value>)",
      },
      fontSize: {
        // 1.2 type scale (rem / line-height)
        xs: [".75rem", "1rem"], sm: [".875rem", "1.25rem"], base: ["1rem", "1.5rem"], lg: ["1.125rem", "1.75rem"],
        xl: ["1.25rem", "1.75rem"], "2xl": ["1.5rem", "2rem"], "3xl": ["1.875rem", "2.25rem"],
      },
      borderRadius: { sm: "4px", md: "8px", lg: "12px" },
      boxShadow: {
        glow: "var(--shadow-glow)",
        "elev-1": "var(--shadow-1)",
        "elev-2": "var(--shadow-2)",
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
