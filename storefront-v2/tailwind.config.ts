import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta oficial Bibelô — idêntica ao storefront v1
        bibelo: {
          pink:        "#fe68c4",   // Pink principal — botões, badges, destaques
          "pink-dark": "#e050a8",   // Pink escuro — hover
          rosa:        "#ffe5ec",   // Rosa claro — fundos suaves
          amarelo:     "#fff7c1",   // Amarelo — fundo banners, hero
          yellow:      "#fff7c1",   // Alias para amarelo
          "yellow-dark": "#fff0a0", // Amarelo escuro — hover
          dark:        "#2d2d2d",   // Texto escuro
          gray:        "#e5e7eb",   // Topbar, bordas
          "gray-light": "#f9fafb",  // Fundo seções alternadas
        },
      },
      fontFamily: {
        sans: ['"Jost"', "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        heading: ['"Cormorant Garamond"', "Georgia", "serif"],
      },
      screens: {
        xs: "480px",
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px",
      },
      container: {
        center: true,
        padding: {
          DEFAULT: "1rem",
          sm: "1.5rem",
          lg: "2rem",
          xl: "2rem",
          "2xl": "2rem",
        },
        screens: {
          sm: "640px",
          md: "768px",
          lg: "1024px",
          xl: "1280px",
          "2xl": "1400px",
        },
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
}

export default config
