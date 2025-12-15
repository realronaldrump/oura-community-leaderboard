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
                // Monochromatic background
                base: '#0C0C0C',
                raised: '#141414',
                elevated: '#1C1C1C',
                hover: '#242424',
                
                // Borders
                border: {
                    subtle: '#222222',
                    DEFAULT: '#333333',
                    strong: '#444444',
                },
                
                // ONE accent color
                accent: '#00C896',
                'accent-dim': 'rgba(0, 200, 150, 0.15)',
                
                // Functional metric colors (muted)
                metric: {
                    green: '#34D399',
                    blue: '#60A5FA',
                    amber: '#FBBF24',
                    red: '#F87171',
                },
                
                // Text
                text: {
                    primary: '#FAFAFA',
                    secondary: '#A0A0A0',
                    muted: '#666666',
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
            // Minimal transitions
            transitionDuration: {
                DEFAULT: '150ms',
            },
        },
    },
    plugins: [],
}
