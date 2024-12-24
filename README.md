### Hacker News Companion - Chrome Extension

[![Basic features video](http://img.youtube.com/vi/N8711ldzVkU/maxresdefault.jpg)](https://www.youtube.com/watch?v=N8711ldzVkU)

> [!TIP]
> You can also find this extension on the [Chrome Web Store](https://chromewebstore.google.com/detail/hackernews-comment-enhanc/khfcainelcaedmmhjicphbkpigklejgf).

## 🚀 Quick Start Guide
1. Install from [Chrome Web Store](https://chromewebstore.google.com/detail/hackernews-comment-enhanc/khfcainelcaedmmhjicphbkpigklejgf)
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
  * Use Chrome's built-in AI for local processing
  * Connect to OpenAI, Anthropic, or Ollama for advanced summaries

* **Enhanced Comment Navigation**
    * Quick-jump between comments by the same author
    * Visual indicators for post authors and comment counts
    * Comment count display

* **Rich User Interactions**
    * User profile previews on hover
    * Resizable summary panel
    * Comment path tracking and navigation

## 🤖 AI Provider Setup Guide

### Chrome Built-in AI (Free, Local Processing)
1. Requirements:
    * Chrome version 131 or higher
    * One-time model download

2. Setup Steps:
   ```
   1. Open Chrome and navigate to chrome://flags
   2. Search for "Summarization"
   3. Enable "Summarization API for Gemini Nano"
   4. Restart Chrome
   5. Ensure that summarization works in the [Summarization API Playground](https://chrome.dev/web-ai-demos/summarization-api-playground/)
   ```

3. Best Practices:
    * Ideal for individual comments or brief threads
    * May have limitations with very long discussions
    * No API key required

### Ollama (Free, Local Processing)
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
* Email: [support@example.com]

## 📜 License
MIT Licensed - free to use, modify, and distribute

## 🙏 Acknowledgments
* Hacker News community
* AI provider partners
* Open source contributors


> [!NOTE] 
> Note: This extension is not endorsed by, affiliated with, or sponsored by Y Combinator or Hacker News.
