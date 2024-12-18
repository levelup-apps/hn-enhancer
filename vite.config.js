import { defineConfig } from 'vite';
import tailwindcss from 'tailwindcss';

export default defineConfig({
  plugins: [
    tailwindcss()
  ],
  build: {
    rollupOptions: {
      input: {
        main: './content.js',
        popup: './popup.js',
        navigation: './navigation.js',
        summarization: './summarization.js'
      }
    }
  }
});
