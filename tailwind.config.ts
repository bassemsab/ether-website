import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1.5rem',
        sm: '2rem',
        lg: '3rem',
        xl: '4rem'
      }
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-neue)', 'var(--font-sans)', 'system-ui'],
        display: ['var(--font-display)', 'var(--font-neue)', 'system-ui'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular']
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        brand: {
          DEFAULT: '#1E1B4B',
          light: '#D9D6FF',
          dark: '#0B0A24'
        },
        accent: {
          DEFAULT: '#FF7043',
          soft: '#FFD9C7'
        },
        muted: {
          DEFAULT: '#F5F1E8',
          foreground: '#6E655B'
        },
        card: {
          DEFAULT: '#F9F5EC',
          foreground: '#1B162A'
        }
      },
      boxShadow: {
        'retro-sm': '4px 4px 0px 0px rgba(30,27,57,0.15)',
        retro: '12px 12px 0px 0px rgba(30,27,57,0.12)',
        glow: '0 35px 120px -60px rgba(30,27,57,0.55)'
      },
      backgroundImage: {
        grain:
          'radial-gradient(circle at 1px 1px, rgba(30,27,75,0.075) 1px, transparent 0)'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' }
        }
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite',
        marquee: 'marquee 30s linear infinite'
      },
      borderRadius: {
        lg: '1.5rem',
        xl: '2.5rem'
      }
    }
  },
  plugins: [
    forms({
      strategy: 'class'
    }),
    typography,
    plugin(({ addBase }) => {
      addBase({
        '::selection': {
          backgroundColor: '#FF7043',
          color: '#0B0A24'
        }
      });
    })
  ]
};

export default config;
