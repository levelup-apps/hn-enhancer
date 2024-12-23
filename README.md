### Hacker News Companion - Chrome Extension

[![Basic features video](http://img.youtube.com/vi/N8711ldzVkU/maxresdefault.jpg)](https://www.youtube.com/watch?v=N8711ldzVkU)

### Chrome Web Store Listing
> [!TIP]
> You can also find this extension on the [Chrome Web Store](https://chromewebstore.google.com/detail/hackernews-comment-enhanc/khfcainelcaedmmhjicphbkpigklejgf).

Transform your Hacker News experience with intelligent navigation, AI-powered summaries, and enhanced user interaction. This extension streamlines how you read and navigate through discussions, making it easier than ever to engage with rich conversations.

### Key Features:
* Smart keyboard navigation across posts and comments using Vim-inspired shortcuts (h, j, k, l)
* AI-powered thread summarization with multiple options:
    * Use Chrome's built-in AI for local processing
    * Connect to OpenAI, Anthropic, or Ollama for advanced summaries
    * Summarize entire threads or specific comment branches
* Enhanced comment navigation:
    * Quick-jump between comments by the same author
    * Collapsible comment threads
    * Visual indicators for post authors and comment counts
* Rich user interactions:
    * User profile previews on hover
    * Resizable summary panel
    * Comment path tracking and navigation
* Convenient help panel (press '?' to view all shortcuts)

Perfect for:
* Power users who prefer keyboard-driven browsing
* Readers who want quick insights from lengthy discussions
* Anyone seeking a more efficient way to explore Hacker News content
* Users who value both local and cloud-based AI processing options

Installation & Source Code:
* Install from Chrome Web Store: https://chromewebstore.google.com/detail/hackernews-comment-enhanc/khfcainelcaedmmhjicphbkpigklejgf
* MIT Licensed - free to use, modify, and distribute
* Contributions and feedback welcome!

Active Development:
* Regular updates and new features
* Growing support for different AI providers
* Performance optimizations for large threads
* Community-driven improvements

> [!NOTE] 
> Note: This extension is not endorsed by, affiliated with, or sponsored by Y Combinator or Hacker News.

### Local development & Installation
1. Download the Extension Files:  
   - Clone or download the repository to your local machine.

2. Open Chrome Extensions Page:  
   - Open Google Chrome. 
   - Navigate to chrome://extensions/.

3. Enable Developer Mode:  
   - In the top right corner, toggle the switch to enable "Developer mode".
   
4. Load Unpacked Extension:  
   - Click on the "Load unpacked" button.
   - Select the directory where you downloaded the extension files.

5. Verify Installation:  
   - The extension should now appear in your list of installed extensions.
   - Ensure it is enabled.

### Usage:
- Navigate to the [HackerNews website](https://news.ycombinator.com/).
- The extension should automatically enhance the page.

> [!IMPORTANT] Enable CORS for Ollama API
> Ollama supports CORS through an environment variable `OLLAMA_ORIGINS` that specifies the origins that are allowed to access the API.
> This should be set at the system level so that the Options page of the extension and HN page can call the Ollama API http://localhost:11434//api/generate.
> Run the following command after every system restart.
> To make this setting persist across system restarts, add the command to your shell profile (e.g. ~/.bash_profile, ~/.zshrc, etc).

``` bash
# Set the environment variable 
launchctl setenv OLLAMA_ORIGINS "chrome-extension://*,https://news.ycombinator.com"

# Confirm that the environment variable is set:
launchctl getenv OLLAMA_ORIGINS

```