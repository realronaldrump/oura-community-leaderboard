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
                oura: {
                    dark: '#121212',
                    card: '#1E1E1E',
                    accent: '#EAEAEA',
                    purple: '#9F7AEA',
                    blue: '#4299E1',
                    teal: '#38B2AC',
                    success: '#48BB78',
                    warning: '#ECC94B',
                    danger: '#F56565',
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            }
        },
    },
    plugins: [],
}
