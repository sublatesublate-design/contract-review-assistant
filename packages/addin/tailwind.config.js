/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './taskpane.html',
        './src/**/*.{ts,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    50: '#eff6ff',
                    100: '#dbeafe',
                    500: '#3b82f6',
                    600: '#2563eb',
                    700: '#1d4ed8',
                    900: '#1e3a8a',
                },
                risk: {
                    high: '#ef4444',
                    medium: '#f59e0b',
                    low: '#10b981',
                    info: '#6366f1',
                },
            },
            fontFamily: {
                sans: [
                    '-apple-system',
                    'BlinkMacSystemFont',
                    '"PingFang SC"',
                    '"Microsoft YaHei"',
                    'Segoe UI',
                    'sans-serif',
                ],
            },
            animation: {
                'slide-in': 'slideIn 0.2s ease-out',
                'fade-in': 'fadeIn 0.15s ease-in',
                'pulse-ring': 'pulseRing 1.5s ease-out infinite',
            },
            keyframes: {
                slideIn: {
                    from: { transform: 'translateX(100%)' },
                    to: { transform: 'translateX(0)' },
                },
                fadeIn: {
                    from: { opacity: 0 },
                    to: { opacity: 1 },
                },
                pulseRing: {
                    '0%': { transform: 'scale(0.8)', opacity: 1 },
                    '100%': { transform: 'scale(2)', opacity: 0 },
                },
            },
        },
    },
    plugins: [],
};
