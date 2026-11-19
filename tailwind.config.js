/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#12296B',
          deep: '#0C1E52',
          soft: '#22407F',
        },
        blue: {
          brand: '#1D4A9B',
          soft: '#F0F5FF',
          line: '#D8E3F8',
        },
      },
      fontFamily: {
        sans: [
          'Pretendard Variable',
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Roboto',
          '"Malgun Gothic"',
          '"Apple SD Gothic Neo"',
          'sans-serif',
        ],
        round: ['Jua', 'Pretendard Variable', 'Pretendard', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 8px 24px -12px rgba(18, 41, 107, 0.25)',
        card: '0 4px 16px -8px rgba(18, 41, 107, 0.18)',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-6px)' },
          '75%': { transform: 'translateX(6px)' },
        },
        pop: {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        fadein: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shake: 'shake 0.3s ease-in-out',
        pop: 'pop 0.15s ease-out',
        fadein: 'fadein 0.25s ease-out',
      },
    },
  },
  plugins: [],
}
