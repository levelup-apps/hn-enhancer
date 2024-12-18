### HackerNews Enhancer - Chrome Extension

[![Basic features video](http://img.youtube.com/vi/N8711ldzVkU/maxresdefault.jpg)](https://www.youtube.com/watch?v=N8711ldzVkU)

This is a Chrome extension that enhances the HackerNews website by adding the following features:
- For each comment, hovering on the author element shows a tooltip with the author's details.
  - Also show the total number of comments made by the author.
  - Add links to navigate to the author's next and previous comments in the current thread.

### Installation
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
- Navigate to the [HackerNews website](https://news.ycombinator.com/news).
- The extension should automatically enhance the page (specifically the item details page https://news.ycombinator.com/item?id={itemid}) with new features.

## Enable CORS for Ollama API
Ollama supports CORS through an environment variable `OLLAMA_ORIGINS` that specifies the origins that are allowed to access the API.
This should be set at the system level so that the Options page of the extension and HN page can call the Ollama API http://localhost:11434//api/generate.
Run the following command after every system restart.
To make this setting persist across system restarts, add the command to your shell profile (e.g. ~/.bash_profile, ~/.zshrc, etc).

``` bash
# Set the environment variable 
launchctl setenv OLLAMA_ORIGINS "chrome-extension://*,https://news.ycombinator.com"

# Confirm that the environment variable is set:
launchctl getenv OLLAMA_ORIGINS

```