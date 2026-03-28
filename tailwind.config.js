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
                // Claymorphism Background System
                base: '#F2EDE8',
                void: '#F2EDE8',
                raised: '#FFFFFF',
                elevated: '#FAF7F4',
                hover: '#F0EBE5',

                // Borders - soft, barely there
                border: {
                    subtle: 'rgba(0, 0, 0, 0.06)',
                    DEFAULT: 'rgba(0, 0, 0, 0.10)',
                    strong: 'rgba(0, 0, 0, 0.15)',
                },
                'dashboard-border': 'rgba(0, 0, 0, 0.06)',

                // Accent colors - warm, friendly
                accent: {
                    DEFAULT: '#6B9E8A',
                    cyan: '#6B9E8A',
                    purple: '#A08BBE',
                    orange: '#D4A574',
                },
                'accent-dim': 'rgba(107, 158, 138, 0.12)',

                // Metric colors - soft, pastel
                metric: {
                    green: '#7BC4A0',
                    blue: '#7BA8D4',
                    amber: '#D4B87B',
                    red: '#D4897B',
                    readiness: '#7BC4A0',
                    sleep: '#7BA8D4',
                    activity: '#D4B87B',
                },

                // Text - warm tones
                text: {
                    primary: '#2D2A26',
                    secondary: '#7A756E',
                    muted: '#A8A29E',
                    dim: '#C8C2BB',
                },
            },
            fontFamily: {
                sans: ['Nunito', 'system-ui', 'sans-serif'],
                mono: ['IBM Plex Mono', 'monospace'],
            },
            borderRadius: {
                DEFAULT: '16px',
                sm: '8px',
                md: '12px',
                lg: '16px',
                xl: '20px',
                '2xl': '24px',
            },
            boxShadow: {
                'clay': '6px 6px 12px rgba(0, 0, 0, 0.08), -6px -6px 12px rgba(255, 255, 255, 0.9), inset 1px 1px 2px rgba(255, 255, 255, 0.7), inset -1px -1px 2px rgba(0, 0, 0, 0.04)',
                'clay-sm': '3px 3px 6px rgba(0, 0, 0, 0.06), -3px -3px 6px rgba(255, 255, 255, 0.8), inset 1px 1px 1px rgba(255, 255, 255, 0.5), inset -1px -1px 1px rgba(0, 0, 0, 0.03)',
                'clay-lg': '10px 10px 20px rgba(0, 0, 0, 0.1), -10px -10px 20px rgba(255, 255, 255, 0.95), inset 2px 2px 4px rgba(255, 255, 255, 0.8), inset -2px -2px 4px rgba(0, 0, 0, 0.05)',
                'clay-inset': 'inset 3px 3px 6px rgba(0, 0, 0, 0.08), inset -3px -3px 6px rgba(255, 255, 255, 0.7)',
                'clay-button': '4px 4px 8px rgba(0, 0, 0, 0.08), -4px -4px 8px rgba(255, 255, 255, 0.9), inset 1px 1px 2px rgba(255, 255, 255, 0.6)',
                'clay-button-pressed': 'inset 3px 3px 6px rgba(0, 0, 0, 0.1), inset -3px -3px 6px rgba(255, 255, 255, 0.6)',
            },
            transitionDuration: {
                DEFAULT: '200ms',
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
            },
            animation: {
                float: 'float 6s ease-in-out infinite',
                shimmer: 'shimmer 2s linear infinite',
                'fade-in': 'fade-in 0.3s ease-out',
                'fade-in-up': 'fade-in-up 0.4s ease-out',
                'gentle-bounce': 'gentle-bounce 2s ease-in-out infinite',
            },
        },
    },
    plugins: [],
}
