# Important
> [!IMPORTANT]  
> ‼️ This repository has moved to https://github.com/hncompanion/browser-extension

---

### Hacker News Companion - Chrome Extension

[![Basic features video](http://img.youtube.com/vi/uPRh7UKYd8E/maxresdefault.jpg)](https://www.youtube.com/watch?v=uPRh7UKYd8E)

> [!TIP]
> You can also find this extension on the [Chrome Web Store](https://chromewebstore.google.com/detail/hacker-news-companion/khfcainelcaedmmhjicphbkpigklejgf).

## 🚀 Quick Start Guide
1. Install from [Chrome Web Store](https://chromewebstore.google.com/detail/hacker-news-companion/khfcainelcaedmmhjicphbkpigklejgf) or [Firefox Addon store](https://addons.mozilla.org/en-US/firefox/addon/hacker-news-companion/)
2. Navigate to [Hacker News](https://news.ycombinator.com)
3. Press '?' to view keyboard shortcuts
4. Choose your preferred AI provider in extension settings

### Overview
Transform your Hacker News experience with intelligent navigation, AI-powered summaries, and enhanced user interaction. This extension streamlines how you read and navigate through discussions, making it easier than ever to engage with rich conversations.

### 🌟 Key Features
* **Smart Keyboard Navigation**
  * Vim-inspired shortcuts (`h`, `j`, `k`, `l`) for intuitive movement
  * Quick-jump between comments by the same author
  * Collapsible comment threads
  * Press '?' to view all shortcuts

* **AI-Powered Thread Summarization**
  * Multiple AI provider options
  * Summarize entire threads or specific comment branches
  * Connect to cloud-hosted models - OpenAI, Anthropic, or OpenRouter for advanced summaries
  * Use local models hosted on Ollama
  * Use Chrome's built-in AI for local processing on Chrome browser

* **Enhanced Comment Navigation**
    * Quick-jump between comments by the same author
    * Visual indicators for post authors and comment counts
    * Comment count display

* **Rich User Interactions**
    * User profile previews on hover
    * Resizable summary panel
    * Comment path tracking and navigation

## 🤖 AI Provider Setup Guide

### Ollama 
1. Requirements:
    * [Ollama](https://ollama.com/) installed on your system
    * CORS configuration for the extension

2. Setup Steps:
   ```bash
   # Mac OS
   launchctl setenv OLLAMA_ORIGINS "chrome-extension://*,https://news.ycombinator.com"
   
   # Windows
   setx OLLAMA_ORIGINS "chrome-extension://*,https://news.ycombinator.com"
   ```

3. Model Setup:
   ```bash
   # Pull your preferred model
   ollama run llama3.2
   # Or other models like mistral, mixtral, etc.
   ```

4. Best Practices:
    * Keep Ollama running in the background
    * Restart Ollama after CORS configuration
    * Set CORS environment variable to persist across restarts

### Chrome Built-in AI
1. Requirements:
    * Chrome version 131 or higher
    * One-time model download

2. Setup Steps:
   * To verify that you have chrome version higher than 131, navigate to 'About Chrome' `chrome://settings/help` and check the version.
   * To trigger the model download, go to Chrome Dev [Summarization API Playground](https://chrome.dev/web-ai-demos/summarization-api-playground/) and try some text.
   * To verify that the model download is complete, navigate to 'Chrome components' -`chrome://components/` and you should see 'Optimization Guide On Device Model'. Make sure the version is `2024.9.25.2033` or higher.

> [!IMPORTANT]
> Ensure that summarization works in the [Summarization API Playground](https://chrome.dev/web-ai-demos/summarization-api-playground/).

3. Best Practices:
    * Ideal for individual comments or brief threads
    * May have limitations with very long discussions
    * No API key required

### OpenAI
1. Requirements:
    * OpenAI API key
    * Active OpenAI account

2. Setup Steps:
    * Generate API key at [OpenAI Platform](https://platform.openai.com)
    * Enter API key in extension settings (click on the extension icon)
    * Choose preferred model:
        * GPT-4 Turbo (Recommended for best quality)
        * GPT-3.5 Turbo (Faster, more economical)

3. Best Practices:
    * Monitor API usage
    * Consider token limits and costs (bigger discussion threads are truncated to fit into context window)
    * Set up usage alerts in OpenAI dashboard

### Anthropic (Recommended for Best Performance)
1. Requirements:
    * Anthropic API key
    * Active Anthropic account

2. Setup Steps:
    * Generate API key at [Anthropic Console](https://console.anthropic.com)
    * Enter API key in extension settings
    * Select model:
        * Claude 3 Opus (Highest capability)
        * Claude 3.5 Sonnet (Balanced performance)
        * Claude 3.5 Haiku (Fastest)

3. Best Practices:
    * Monitor API usage
    * Set up billing alerts

### OpenRouter
[OpenRouter](https://openrouter.ai/) is a service that provides unified access to multiple large language models (LLMs) through a single API. This platform simplifies the integration and management of different AI models, such as GPT, Claude, and Grok, allowing developers to switch between them without dealing with separate APIs.

1. Requirements:
    * OpenRouter API key
    * Active OpenRouter account with credits

2. Setup Steps:
    * Generate an API key at [OpenRouter](https://openrouter.ai/settings/keys)
    * Enter API key in extension settings (click on the extension icon)
    * Enter your preferred model
        * A list of available models can be found at [OpenRouter models](https://openrouter.ai/models)
        * `anthropic/claude-3.5-sonnet` is our default and a great model to start with

## ⌨️ Keyboard Shortcuts

### Global
* `?` / `/` - Toggle help panel
* `o` - Open post in new window

### Home Page
* `j` / `k` - Next/previous post
* `c` - Open comments page

### Comments Page
* `j` / `k` - Next/previous comment
* `l` / `h` - Next child/parent comment
* `[` / `]` - Previous/next comment by author
* `s` - Toggle summary panel
* `r` - Go to root comment
* `gg` - First comment
* `z` - Scroll to current
* `c` - Collapse/expand comment


## 🛠️ Development Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/levelup-apps/hn-enhancer.git
   cd hn-enhancer
   ```

2. Load in Chrome:
    * Open `chrome://extensions/`
    * Enable Developer mode
    * Click "Load unpacked"
    * Select the extension directory

3. Build the project:
    * Install dependencies:
      ```bash
      pnpm install
      ```
    * Build the project using Vite:
      ```bash
      pnpm run build
      ```

4. Development build:
    * To start a development build with watch mode:
      ```bash
      pnpm run dev
      ```

5. Release build:
    * To create a release build for both Chrome and Firefox:
      ```bash
      pnpm run release
      ```
## Running the download script
If you want to run the script that downloads the HN comments for fine-tuning, follow these steps:
```shell
cd scripts
pnpm install

# build better-sqlite3 from source in order to fix the node bindings for ARM64 on macOS
cd node_modules/better-sqlite3
pnpm rebuild
cd ../..
```
## 🔧 Troubleshooting

### Common Issues

1. **AI Summarization Not Working**
    * Check API key configuration
    * Verify network connectivity
    * Ensure selected AI provider is running (for Ollama)
    * Check Chrome version for Built-in AI

2. **CORS Issues with Ollama**
    * Verify CORS environment variable
    * Restart Ollama after configuration
    * Check Ollama logs for errors

3. **Performance Issues**
    * Try different AI providers
    * Collapse long comment threads
    * Clear browser cache

### Support
* GitHub Issues: [Report bugs](https://github.com/levelup-apps/hn-enhancer/issues)

## 📜 License
MIT Licensed - free to use, modify, and distribute

## 🙏 Acknowledgments
* Hacker News community
* AI provider partners
* Open source contributors
* Valuable feedback from [Liza George](https://www.linkedin.com/in/george-liza/)


> [!NOTE] 
> Note: This extension is not endorsed by, affiliated with, or sponsored by Y Combinator or Hacker News.
