/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Monochromatic Slate Palette
                slate: {
                    50: '#f8fafc',
                    100: '#f1f5f9',
                    200: '#e2e8f0', // Surface Borders
                    300: '#cbd5e1',
                    400: '#94a3b8', // Muted Text
                    500: '#64748b',
                    600: '#475569', // Body Text
                    700: '#334155',
                    800: '#1e293b', // Headings / Sidebar
                    900: '#0f172a', // Metric Values
                    950: '#020617',
                },
                primary: {
                    DEFAULT: '#0f172a', // Link to Slate 900
                    foreground: '#f8fafc', // Slate 50
                },
                secondary: {
                    DEFAULT: '#f1f5f9', // Slate 100
                    foreground: '#0f172a', // Slate 900
                },
                muted: {
                    DEFAULT: '#f8fafc', // Slate 50
                    foreground: '#64748b', // Slate 500
                },
                accent: {
                    DEFAULT: '#e2e8f0', // Slate 200
                    foreground: '#0f172a', // Slate 900
                },
                destructive: {
                    DEFAULT: '#ef4444', // Red 500 (Use sparingly for errors)
                    foreground: '#f8fafc',
                },
                border: '#e2e8f0', // Slate 200
            },
            fontFamily: {
                sans: ['"Inter"', 'sans-serif'],
            },
            boxShadow: {
                'clean': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
                'clean-lg': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
            }
        },
    },
    plugins: [],
}
