import {defineConfig} from 'wxt';
// @ts-ignore
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
    srcDir: 'src',
    manifest: {
        name: "Hacker News Companion",
        description: "Enhance Hacker News with smart navigation and AI summaries using local or cloud LLMs. Navigate easily with Vim-style shortcuts.",
        homepage_url: "https://github.com/levelup-apps/hn-enhancer",
        version: "1.1.0",
        permissions: ['storage'],
        host_permissions: [
            "https://news.ycombinator.com/*",
            "https://hn.algolia.com/*"
        ],
        icons: {
            16: '/icon/icon-16.png',
            32: '/icon/icon-32.png',
            48: '/icon/icon-48.png',
            128: '/icon/icon-128.png',
        },
        action: {
            default_popup: "options.html"
        },
        browser_specific_settings: {
            gecko: {
                id: "addon@hncompanion.com"
            }
        }
    },
    vite: () => ({
        plugins: [
            tailwindcss(),
        ],
    }),
});
