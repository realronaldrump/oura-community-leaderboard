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
                // Background
                base: '#0C0C0C',
                void: '#0C0C0C',
                raised: '#141414',
                elevated: '#1C1C1C',
                hover: '#242424',

                // Borders
                border: {
                    subtle: '#222222',
                    DEFAULT: '#333333',
                    strong: '#444444',
                },
                'dashboard-border': '#222222',

                // Accent colors
                accent: {
                    DEFAULT: '#00C896',
                    cyan: '#00C896',
                    purple: '#A855F7',
                    orange: '#F59E0B',
                },
                'accent-dim': 'rgba(0, 200, 150, 0.15)',

                // Metric colors
                metric: {
                    green: '#34D399',
                    blue: '#60A5FA',
                    amber: '#FBBF24',
                    red: '#F87171',
                    readiness: '#34D399',
                    sleep: '#60A5FA',
                    activity: '#FBBF24',
                },

                // Text
                text: {
                    primary: '#FAFAFA',
                    secondary: '#A0A0A0',
                    muted: '#666666',
                    dim: '#444444',
                },
            },
            fontFamily: {
                sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
                mono: ['IBM Plex Mono', 'monospace'],
            },
            borderRadius: {
                DEFAULT: '8px',
                sm: '4px',
                md: '6px',
                lg: '8px',
            },
            transitionDuration: {
                DEFAULT: '150ms',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0px)' },
                    '50%': { transform: 'translateY(-20px)' },
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
            },
            animation: {
                float: 'float 6s ease-in-out infinite',
                shimmer: 'shimmer 2s linear infinite',
                'fade-in': 'fade-in 0.3s ease-out',
                'fade-in-up': 'fade-in-up 0.4s ease-out',
            },
        },
    },
    plugins: [],
}
