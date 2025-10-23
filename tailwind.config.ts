import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";
import plugin from "tailwindcss/plugin";
import type { Config } from "tailwindcss";

const retroui = plugin(({ addBase }) => {
  addBase({
    ":root": {
      colorScheme: "light",
      "--background": "45 54% 97%",
      "--foreground": "248 27% 15%",
      "--muted": "40 35% 90%",
      "--muted-foreground": "32 15% 40%",
      "--card": "46 56% 96%",
      "--card-foreground": "249 37% 17%",
      "--surface": "50 30% 96%",
      "--brand": "259 45% 15%",
      "--brand-foreground": "0 0% 100%",
      "--accent": "16 100% 64%",
      "--accent-soft": "20 100% 92%",
    },
    html: {
      scrollBehavior: "smooth",
    },
    body: {
      minHeight: "100vh",
      backgroundColor: "hsl(var(--background))",
      color: "hsl(var(--foreground))",
      fontFamily: "var(--font-neue), system-ui, sans-serif",
      textRendering: "optimizeLegibility",
    },
    "::selection": {
      backgroundColor: "hsl(var(--accent))",
      color: "hsl(var(--brand))",
    },
  });
});

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx,mdx}",
    "./lib/**/*.{ts,tsx,mdx}",
    "./content/**/*.{md,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1.5rem",
        sm: "2rem",
        lg: "3rem",
        xl: "4rem",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-neue)", "var(--font-sans)", "system-ui"],
        display: ["var(--font-display)", "var(--font-neue)", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular"],
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        brand: {
          DEFAULT: "hsl(var(--brand))",
          light: "#D9D6FF",
          dark: "#0B0A24",
          foreground: "hsl(var(--brand-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          soft: "hsl(var(--accent-soft))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        surface: "hsl(var(--surface))",
      },
      boxShadow: {
        "retro-sm": "4px 4px 0px 0px rgba(30,27,57,0.15)",
        retro: "12px 12px 0px 0px rgba(30,27,57,0.12)",
        glow: "0 35px 120px -60px rgba(30,27,57,0.55)",
      },
      backgroundImage: {
        grain:
          "radial-gradient(circle at 1px 1px, rgba(30,27,75,0.075) 1px, transparent 0)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
        marquee: "marquee 30s linear infinite",
      },
      borderRadius: {
        lg: "1.5rem",
        xl: "2.5rem",
      },
    },
  },
  plugins: [
    retroui,
    forms({
      strategy: "class",
    }),
    typography,
  ],
};

export default config;
