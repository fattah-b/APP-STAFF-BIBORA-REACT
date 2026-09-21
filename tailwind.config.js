/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--primary)",
        "primary-container": "var(--primary-container)",
        "on-primary": "var(--on-primary)",
        background: "var(--background)",
        surface: "var(--surface)",
        "surface-container": "var(--surface-container)",
        "surface-container-low": "var(--surface-container-low)",
        "surface-container-high": "var(--surface-container-high)",
        "surface-container-lowest": "var(--surface-container-lowest)",
        "surface-container-highest": "var(--surface-container-highest)",
        "on-surface": "var(--on-surface)",
        "on-surface-variant": "var(--on-surface-variant)",
        "outline-variant": "var(--outline-variant)",
        outline: "var(--outline)",
        secondary: "var(--secondary)",
        "secondary-container": "var(--secondary-container)",
        "on-secondary-container": "var(--on-secondary-container)",
        tertiary: "var(--tertiary)",
        "tertiary-container": "var(--tertiary-container)",
        "on-tertiary-container": "var(--on-tertiary-container)",
        "primary-fixed-dim": "var(--primary-fixed-dim)",
        "error": "var(--error)",
        "error-container": "var(--error-container)",
        "on-error-container": "var(--on-error-container)",
      },
      fontFamily: {
        body: ["Be Vietnam Pro", "Montserrat", "sans-serif"],
      }
    },
  },
  plugins: [],
}
