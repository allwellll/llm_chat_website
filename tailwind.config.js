/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        claude: {
          bg: 'rgb(var(--bg-primary) / <alpha-value>)',
          sidebar: 'rgb(var(--bg-secondary) / <alpha-value>)',
          surface: 'rgb(var(--bg-surface) / <alpha-value>)',
          card: 'rgb(var(--bg-card) / <alpha-value>)',
          'card-hover': 'rgb(var(--bg-card-hover) / <alpha-value>)',
          input: 'rgb(var(--bg-input) / <alpha-value>)',
          border: 'rgb(var(--border-color) / <alpha-value>)',
          'border-subtle': 'rgb(var(--border-subtle) / <alpha-value>)',
          coral: '#DA7756',
          'coral-hover': '#C86545',
          'coral-muted': 'rgba(218, 119, 86, 0.15)',
          'coral-border': 'rgba(218, 119, 86, 0.35)',
          text: {
            primary: 'rgb(var(--text-primary) / <alpha-value>)',
            secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
            muted: 'rgb(var(--text-muted) / <alpha-value>)',
            dark: '#1C1B18'
          },
          light: {
            bg: '#FAF9F5',
            sidebar: '#F3F2EE',
            card: '#FFFFFF',
            input: '#FFFFFF',
            border: '#E5E4DE',
            'border-subtle': '#ECEBE5',
            text: '#1C1B18',
            'text-secondary': '#66655F',
            'text-muted': '#999890'
          }
        }
      },
      fontFamily: {
        serif: ['"Copernicus"', '"Tiempos Headline"', 'Georgia', 'Cambria', '"Times New Roman"', 'serif'],
        sans: ['"Claude Sans"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'Consolas', '"Courier New"', 'monospace']
      },
      boxShadow: {
        'claude-input': '0 4px 20px -2px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        'claude-input-focus': '0 6px 24px -2px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(218, 119, 86, 0.4)',
        'claude-dropdown': '0 10px 30px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        'claude-modal': '0 20px 40px -10px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1)'
      }
    },
  },
  plugins: [],
}
