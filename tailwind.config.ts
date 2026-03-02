import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        clicvend: {
          green: "#00A78F",
          "green-dark": "#008F7A",
          "green-light": "#00C4A7",
          white: "#FFFFFF",
          black: "#0a0a0a",
          /* mantidos para compatibilidade */
          blue: "#1A376B",
          orange: "#00A78F",
          "orange-dark": "#008F7A",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
