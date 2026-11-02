import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        midnight: { DEFAULT: '#0b0a1a', 800: '#12102a', 700: '#1a1738', 600: '#241f4d' },
        ember: { DEFAULT: '#f59e0b', soft: '#fbbf24', deep: '#b45309', glow: '#fde68a' },
        marigold: '#f97316',
        parchment: '#f5e6c8',
      },
      // One family everywhere (self-hosted via @fontsource-variable/manrope); hierarchy comes from weight and size.
      fontFamily: {
        display: ['"Manrope Variable"', 'Manrope', 'system-ui', 'sans-serif'],
        body: ['"Manrope Variable"', 'Manrope', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        page: '96rem',
      },
      boxShadow: {
        ember: '0 0 24px rgba(245, 158, 11, 0.35), 0 0 60px rgba(245, 158, 11, 0.15)',
        'ember-lg': '0 0 40px rgba(251, 191, 36, 0.5), 0 0 120px rgba(245, 158, 11, 0.25)',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '45%': { opacity: '0.85', transform: 'scale(0.97) translateY(1px)' },
          '70%': { opacity: '0.95', transform: 'scale(1.02)' },
        },
        rise: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 24px rgba(245,158,11,0.3), 0 0 60px rgba(245,158,11,0.12)' },
          '50%': { boxShadow: '0 0 36px rgba(251,191,36,0.45), 0 0 100px rgba(245,158,11,0.22)' },
        },
        spinSlow: { to: { transform: 'rotate(360deg)' } },
        spark: {
          '0%': { opacity: '0', transform: 'translate(0, 0) scale(1)' },
          '15%': { opacity: '1' },
          '100%': { opacity: '0', transform: 'translate(var(--dx, 0px), -46px) scale(0.3)' },
        },
        ignite: {
          '0%': { opacity: '0', transform: 'scale(0.15)' },
          '55%': { opacity: '1', transform: 'scale(1.18)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        drift: {
          '0%': { opacity: '0', transform: 'translate3d(0, 0, 0)' },
          '12%': { opacity: 'var(--o, 0.6)' },
          '85%': { opacity: 'calc(var(--o, 0.6) * 0.6)' },
          '100%': { opacity: '0', transform: 'translate3d(var(--dx, 0px), -105vh, 0)' },
        },
        sway: {
          '0%, 100%': { transform: 'translateX(-10px)' },
          '50%': { transform: 'translateX(10px)' },
        },
        toranSway: {
          '0%, 100%': { transform: 'rotate(-1.2deg)' },
          '50%': { transform: 'rotate(1.2deg)' },
        },
        barShimmer: {
          '0%': { transform: 'translateX(-120%)' },
          '60%, 100%': { transform: 'translateX(320%)' },
        },
        burst: {
          '0%': { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
          '100%': {
            opacity: '0',
            transform: 'translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(0.2)',
          },
        },
        burstLoop: {
          '0%': { opacity: '0', transform: 'translate(-50%, -50%) scale(1)' },
          '5%': { opacity: '1' },
          '45%, 100%': {
            opacity: '0',
            transform: 'translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(0.2)',
          },
        },
        ember: {
          '0%, 100%': { opacity: '0.75', transform: 'scale(0.9)' },
          '50%': { opacity: '1', transform: 'scale(1.15)' },
        },
        smoke: {
          '0%': { opacity: '0', transform: 'translateY(6px) scaleY(0.9)' },
          '35%': { opacity: '1' },
          '100%': { opacity: '0', transform: 'translateY(-10px) scaleY(1.1)' },
        },
        glowBreathe: {
          '0%, 100%': { opacity: '0.85', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.06)' },
        },
      },
      animation: {
        flicker: 'flicker 2.6s ease-in-out infinite',
        rise: 'rise 0.6s ease-out both',
        'pulse-glow': 'pulseGlow 3s ease-in-out infinite',
        'spin-slow': 'spinSlow 90s linear infinite',
        ember: 'ember 1.8s ease-in-out infinite',
        smoke: 'smoke 5s ease-out infinite',
        'glow-breathe': 'glowBreathe 3.4s ease-in-out infinite',
        spark: 'spark 2.6s ease-out infinite',
        ignite: 'ignite 0.9s cubic-bezier(0.2, 0.8, 0.3, 1.2) both',
        drift: 'drift 18s linear infinite',
        sway: 'sway 5s ease-in-out infinite',
        'toran-sway': 'toranSway 6s ease-in-out infinite',
        'bar-shimmer': 'barShimmer 3.6s ease-in-out infinite',
        burst: 'burst 1.2s cubic-bezier(0.15, 0.7, 0.3, 1) both',
        'burst-loop': 'burstLoop 3.2s cubic-bezier(0.15, 0.7, 0.3, 1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
