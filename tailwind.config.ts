import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        pastel: {
          lilac: {
            DEFAULT: "hsl(var(--pastel-lilac))",
            foreground: "hsl(var(--pastel-lilac-foreground))",
          },
          yellow: {
            DEFAULT: "hsl(var(--pastel-yellow))",
            foreground: "hsl(var(--pastel-yellow-foreground))",
          },
          blue: {
            DEFAULT: "hsl(var(--pastel-blue))",
            foreground: "hsl(var(--pastel-blue-foreground))",
          },
          green: {
            DEFAULT: "hsl(var(--pastel-green))",
            foreground: "hsl(var(--pastel-green-foreground))",
          },
          pink: {
            DEFAULT: "hsl(var(--pastel-pink))",
            foreground: "hsl(var(--pastel-pink-foreground))",
          },
          orange: {
            DEFAULT: "hsl(var(--pastel-orange))",
            foreground: "hsl(var(--pastel-orange-foreground))",
          },
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-lilac': 'var(--gradient-lilac)',
        'gradient-yellow': 'var(--gradient-yellow)',
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        card: 'var(--shadow-card)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        '2xl': "calc(var(--radius) + 8px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        /** Transição entre páginas (app nativa) — forward / back */
        "edu-page-enter-forward": {
          from: {
            transform: "translate3d(100%,0,0)",
            opacity: "0.992",
          },
          to: {
            transform: "translate3d(0,0,0)",
            opacity: "1",
          },
        },
        "edu-page-enter-back": {
          from: {
            transform: "translate3d(-42%,0,0)",
            opacity: "0.94",
          },
          to: {
            transform: "translate3d(0,0,0)",
            opacity: "1",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "edu-page-enter-forward":
          "edu-page-enter-forward 0.32s cubic-bezier(0.25, 0.82, 0.25, 1) both",
        "edu-page-enter-back":
          "edu-page-enter-back 0.32s cubic-bezier(0.25, 0.82, 0.25, 1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
