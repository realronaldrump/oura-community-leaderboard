export default {
    content: [
        "./index.html",
        "./pages/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                canvas: 'var(--color-canvas)',
                surface: {
                    DEFAULT: 'var(--color-surface)',
                    raised: 'var(--color-surface-raised)',
                    subtle: 'var(--color-surface-subtle)',
                    strong: 'var(--color-surface-strong)',
                },
                line: {
                    DEFAULT: 'var(--color-line)',
                    strong: 'var(--color-line-strong)',
                },
                ink: {
                    DEFAULT: 'var(--color-ink)',
                    secondary: 'var(--color-ink-secondary)',
                    muted: 'var(--color-ink-muted)',
                    faint: 'var(--color-ink-faint)',
                },
                accent: {
                    DEFAULT: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
                    hover: 'var(--color-accent-hover)',
                    soft: 'var(--color-accent-soft)',
                },
                success: {
                    DEFAULT: 'rgb(var(--color-success-rgb) / <alpha-value>)',
                    soft: 'var(--color-success-soft)',
                },
                warning: {
                    DEFAULT: 'rgb(var(--color-warning-rgb) / <alpha-value>)',
                    soft: 'var(--color-warning-soft)',
                },
                error: {
                    DEFAULT: 'rgb(var(--color-error-rgb) / <alpha-value>)',
                    soft: 'var(--color-error-soft)',
                },
                info: {
                    DEFAULT: 'rgb(var(--color-info-rgb) / <alpha-value>)',
                    soft: 'var(--color-info-soft)',
                },
                metric: {
                    readiness: 'rgb(var(--color-readiness-rgb) / <alpha-value>)',
                    sleep: 'rgb(var(--color-sleep-rgb) / <alpha-value>)',
                    activity: 'rgb(var(--color-activity-rgb) / <alpha-value>)',
                    insight: 'rgb(var(--color-insight-rgb) / <alpha-value>)',
                },
                /* Transitional aliases: legacy utilities still resolve to semantic roles. */
                void: 'var(--color-canvas)',
                raised: 'var(--color-surface)',
                elevated: 'var(--color-surface-raised)',
                hover: 'var(--color-surface-subtle)',
                border: {
                    subtle: 'var(--color-line)',
                    DEFAULT: 'var(--color-line)',
                    strong: 'var(--color-line-strong)',
                },
                'dashboard-border': 'var(--color-line)',
                'accent-dim': 'var(--color-accent-soft)',
                text: {
                    primary: 'var(--color-ink)',
                    secondary: 'var(--color-ink-secondary)',
                    muted: 'var(--color-ink-muted)',
                    dim: 'var(--color-ink-faint)',
                },
            },
            fontFamily: {
                sans: ['Manrope', 'Avenir Next', 'sans-serif'],
                display: ['Newsreader', 'Georgia', 'serif'],
                mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
            },
            borderRadius: {
                DEFAULT: 'var(--radius-md)',
                sm: 'var(--radius-sm)',
                md: 'var(--radius-md)',
                lg: 'var(--radius-lg)',
                xl: 'var(--radius-xl)',
                '2xl': 'var(--radius-xl)',
            },
            boxShadow: {
                sm: 'var(--shadow-sm)',
                card: 'var(--shadow-card)',
                lg: 'var(--shadow-lg)',
                pressed: 'var(--shadow-pressed)',
                button: 'var(--shadow-sm)',
            },
            transitionDuration: {
                DEFAULT: 'var(--duration-base)',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-10px)' },
                },
                shimmer: {
                    '0%': { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
                'fade-in': {
                    from: { opacity: '0' },
                    to: { opacity: '1' },
                },
                'fade-in-up': {
                    from: { opacity: '0', transform: 'translateY(12px)' },
                    to: { opacity: '1', transform: 'translateY(0)' },
                },
                'gentle-bounce': {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-4px)' },
                },
                'slide-in-right': {
                    from: { opacity: '0', transform: 'translateX(16px)' },
                    to: { opacity: '1', transform: 'translateX(0)' },
                },
                'scale-in': {
                    from: { opacity: '0', transform: 'scale(0.95)' },
                    to: { opacity: '1', transform: 'scale(1)' },
                },
                'pulse-soft': {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.7' },
                },
            },
            animation: {
                float: 'float 6s ease-in-out infinite',
                shimmer: 'shimmer 2s linear infinite',
                'fade-in': 'fade-in 0.3s ease-out',
                'fade-in-up': 'fade-in-up 0.4s ease-out',
                'gentle-bounce': 'gentle-bounce 2s ease-in-out infinite',
                'slide-in-right': 'slide-in-right 0.35s ease-out',
                'scale-in': 'scale-in 0.25s ease-out',
                'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
            },
        },
    },
    plugins: [],
}
