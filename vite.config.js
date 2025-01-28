import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        rollupOptions: {
            input: 'src/content.js', // Entry point
            output: [
                {
                    format: 'iife', // Immediately Invoked Function Expression
                    file: 'dist/chrome/content.bundle.js', // Output file for Chrome
                },
                {
                    format: 'iife', // Immediately Invoked Function Expression
                    file: 'dist/firefox/content.bundle.js', // Output file for Firefox
                }
            ],
        },
    },
});
