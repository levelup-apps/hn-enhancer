import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
    return {
        build: {
            outDir: "dist", // Output directory
            minify: mode === 'production' ? true : false, // Minify only in production mode
            rollupOptions: {
                input: "src/content.js", // Entry point
                output: [
                    {
                        format: "iife", // Immediately Invoked Function Expression
                        entryFileNames: "chrome/content.bundle.js", // Output file for Chrome
                        dir: "dist", // Output directory
                    },
                    {
                        format: "iife", // Immediately Invoked Function Expression
                        entryFileNames: "firefox/content.bundle.js", // Output file for Firefox
                        dir: "dist", // Output directory
                    },
                ],
            },
        },
    };
});