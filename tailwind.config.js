/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Apple-inspired color system
        primary: {
          50: '#f5f5f7',
          100: '#e8e8ed',
          200: '#d2d2dc',
          300: '#b4b4c0',
          400: '#86868b',
          500: '#6e6e73',
          600: '#515154',
          700: '#424245',
          800: '#333336',
          900: '#1d1d1f',
        },
        accent: {
          50: '#e8f4fd',
          100: '#c5e4fa',
          200: '#9dd3f8',
          300: '#6ebef5',
          400: '#47a9f2',
          500: '#007aff', // Apple Blue
          600: '#006ae6',
          700: '#0055bf',
          800: '#004099',
          900: '#002d73',
        },
        surface: {
          primary: '#ffffff',
          secondary: '#f5f5f7',
          tertiary: '#fafafa',
          elevated: 'rgba(255, 255, 255, 0.72)',
        },
        semantic: {
          success: '#34c759',
          warning: '#ff9f0a',
          error: '#ff3b30',
          info: '#5ac8fa',
        },
      },
      fontFamily: {
        sans: [
          'PingFang SC',
          '-apple-system',
          'BlinkMacSystemFont',
          'SF Pro Display',
          'SF Pro Text',
          'Helvetica Neue',
          'Microsoft YaHei',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
      },
      borderRadius: {
        'apple-sm': '8px',
        'apple': '12px',
        'apple-lg': '16px',
        'apple-xl': '20px',
        'apple-2xl': '24px',
      },
      boxShadow: {
        'apple-sm': '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04)',
        'apple': '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
        'apple-lg': '0 8px 24px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.06)',
        'apple-xl': '0 16px 48px rgba(0, 0, 0, 0.16), 0 8px 16px rgba(0, 0, 0, 0.08)',
        'apple-elevated': '0 20px 60px rgba(0, 0, 0, 0.18), 0 12px 24px rgba(0, 0, 0, 0.10)',
        'apple-inner': 'inset 0 1px 3px rgba(0, 0, 0, 0.06)',
      },
      backdropBlur: {
        'apple': '20px',
        'apple-lg': '40px',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      transitionTimingFunction: {
        'apple': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        'apple-spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
