import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        clicvend: {
          blue: "#1A376B",
          orange: "#F88A1D",
          "orange-dark": "#E07A0C",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
