/* Utilities resolve to the design tokens in index.css so both styling paths share one palette. */
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
            },
            fontFamily: {
                sans: ['Manrope', 'Avenir Next', 'system-ui', 'sans-serif'],
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
            },
            transitionDuration: {
                DEFAULT: 'var(--duration-base)',
            },
        },
    },
    plugins: [],
}
