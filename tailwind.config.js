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
                // Clean, professional palette
                dashboard: {
                    bg: '#0f0f0f',
                    card: '#1a1a1a',
                    cardHover: '#222222',
                    border: '#2a2a2a',
                    borderLight: '#3a3a3a',
                },
                // Subtle accent colors for metrics
                metric: {
                    readiness: '#10b981', // emerald
                    sleep: '#3b82f6',     // blue
                    activity: '#f59e0b',  // amber
                    hr: '#ef4444',        // red
                    hrv: '#8b5cf6',       // violet
                    spo2: '#06b6d4',      // cyan
                    temp: '#f97316',      // orange
                    stress: '#ec4899',    // pink
                },
                text: {
                    primary: '#f5f5f5',
                    secondary: '#a3a3a3',
                    muted: '#737373',
                }
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'Menlo', 'monospace'],
            },
            borderRadius: {
                'card': '12px',
            }
        },
    },
    plugins: [],
}
