import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: "Hacker News Companion",
    description: "Enhance Hacker News with smart navigation and AI summaries using local or cloud LLMs. Navigate easily with Vim-style shortcuts.",
    homepage_url: "https://github.com/levelup-apps/hn-enhancer",
    version: "1.1.0",
    permissions: ['storage'],
  },
});
