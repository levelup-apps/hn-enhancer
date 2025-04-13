import {defineConfig} from 'wxt';
// @ts-ignore
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
    srcDir: 'src',
    manifest: ({browser}) => {
        let manifest = {
            name: "Hacker News Companion",
            description: "Enhance Hacker News with smart navigation and AI summaries using local or cloud LLMs. Navigate easily with Vim-style shortcuts.",
            homepage_url: "https://github.com/levelup-apps/hn-enhancer",
            version: "1.5.0",
            permissions: ['storage'],
            host_permissions: [
                "https://news.ycombinator.com/*",
                "https://hn.algolia.com/*"
            ],
            optional_host_permissions: [
                "https://api.openai.com/v1/chat/completions/*",
                "https://api.anthropic.com/v1/messages/*",
                "http://localhost:11434/*",
                "https://openrouter.ai/api/v1/*",
                "https://api.deepseek.com/v1/chat/completions/*"
            ],
            icons: {
                16: '/icon/icon-16.png',
                32: '/icon/icon-32.png',
                48: '/icon/icon-48.png',
                128: '/icon/icon-128.png',
            },
            action: {},
        };
        if(browser === 'firefox') {
            manifest["browser_specific_settings"] = {
                gecko: {
                    id: "addon@hncompanion.com"
                }
            }
        }
        return manifest;
    },
    vite: () => ({
        plugins: [
            tailwindcss(),
        ],
        build: {
            minify: false, // Disable minification
        }
    }),
});
