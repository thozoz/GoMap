/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: 'rgb(var(--color-base) / <alpha-value>)',
        panel: 'rgb(var(--color-panel) / <alpha-value>)',
        header: 'rgb(var(--color-header) / <alpha-value>)',
        hover: 'rgb(var(--color-hover) / <alpha-value>)',
        input: 'rgb(var(--color-input) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        borderPanel: 'rgb(var(--color-border-panel) / <alpha-value>)',
        textMain: 'rgb(var(--color-text-main) / <alpha-value>)',
        textMuted: 'rgb(var(--color-text-muted) / <alpha-value>)',
        
        btnPrimary: 'rgb(var(--color-btn-primary) / <alpha-value>)',
        btnPrimaryHover: 'rgb(var(--color-btn-primary-hover) / <alpha-value>)',
        btnSecondary: 'rgb(var(--color-btn-secondary) / <alpha-value>)',
        btnSecondaryHover: 'rgb(var(--color-btn-secondary-hover) / <alpha-value>)',
        btnSuccess: 'rgb(var(--color-btn-success) / <alpha-value>)',
        btnSuccessHover: 'rgb(var(--color-btn-success-hover) / <alpha-value>)',
        btnDanger: 'rgb(var(--color-btn-danger) / <alpha-value>)',
        btnDangerHover: 'rgb(var(--color-btn-danger-hover) / <alpha-value>)',
        btnNeutral: 'rgb(var(--color-btn-neutral) / <alpha-value>)',
        btnNeutralHover: 'rgb(var(--color-btn-neutral-hover) / <alpha-value>)',
        
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
      }
    },
  },
  plugins: [],
}