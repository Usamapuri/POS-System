/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
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
        bhk: {
          ink:     '#1a1410',
          cream:   '#fdf8f1',
          saffron: '#f59e0b',
          ember:   '#ea580c',
          rose:    '#e11d48',
        },
      },
      fontFamily: {
        serif: ['"Instrument Serif"', '"Iowan Old Style"', '"Apple Garamond"', 'Georgia', 'serif'],
        sans:  ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
      },
      backgroundImage: {
        'bhk-hero': [
          'radial-gradient(circle at 18% 12%, rgba(255,200,120,.55) 0%, transparent 42%)',
          'radial-gradient(circle at 88% 6%,  rgba(244,63,94,.45)  0%, transparent 38%)',
          'radial-gradient(circle at 50% 110%, rgba(180,83,9,.5)   0%, transparent 55%)',
          'linear-gradient(140deg, #2a1407 0%, #4a1d05 45%, #7c2d12 100%)',
        ].join(', '),
        'bhk-cta':          'linear-gradient(180deg, #f97316 0%, #ea580c 60%, #c2410c 100%)',
        'bhk-chip-active':  'linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%)',
      },
      boxShadow: {
        'bhk-cta':       '0 1px 0 rgba(255,255,255,.35) inset, 0 0 0 1px rgba(124,45,18,.4), 0 12px 24px -8px rgba(234,88,12,.55)',
        'bhk-cta-hover': '0 1px 0 rgba(255,255,255,.4)  inset, 0 0 0 1px rgba(124,45,18,.5), 0 18px 32px -10px rgba(234,88,12,.65)',
        'bhk-input':     '0 1px 0 rgba(255,255,255,.6)  inset, 0 1px 2px rgba(120,53,15,.04)',
        'bhk-focus':     '0 0 0 4px rgba(249,115,22,.15), 0 1px 0 rgba(255,255,255,.6) inset',
        'bhk-card':      '0 8px 16px -8px rgba(234,88,12,.35)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in":  { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        "fade-out": { "0%": { opacity: "1" }, "100%": { opacity: "0" } },
        "slide-in": { "0%": { transform: "translateX(-100%)" }, "100%": { transform: "translateX(0)" } },
        "slide-out":{ "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-100%)" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up":   "accordion-up 0.2s ease-out",
        "fade-in":        "fade-in 0.2s ease-out",
        "fade-out":       "fade-out 0.2s ease-out",
        "slide-in":       "slide-in 0.3s ease-out",
        "slide-out":      "slide-out 0.3s ease-out",
      },
    },
  },
  plugins: [],
}
