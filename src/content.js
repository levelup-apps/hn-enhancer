const SummarizeCheckStatus = {
    OK: 'ok',
    TEXT_TOO_SHORT: 'too_short',
    THREAD_TOO_SHALLOW: 'too_shallow',
    THREAD_TOO_DEEP: 'chrome_depth_limit'
};

class HNState {
    static saveLastSeenPostId(postId) {
        chrome.storage.local.set({
            lastSeenPost: {
                id: postId,
                timestamp: Date.now()
            }
        }).catch(_ => {
            // console.error('Error saving current post state:', _);
        });
    }

    static async getLastSeenPostId() {
        try {
            const data = await chrome.storage.local.get('lastSeenPost');
            // Return null if no state or if state is older than 15 minutes
            if (!data.lastSeenPost || Date.now() - data.lastSeenPost.timestamp > (15 * 60 * 1000)) {
                await this.clearLastSeenPost();
                return null;
            }
            return data.lastSeenPost.id;
        } catch (error) {
            // console.error('Error retrieving saved post state:', error);
            return null;
        }
    }

    static async clearLastSeenPost() {
        chrome.storage.local.remove('lastSeenPost').catch(_ => {
            // console.error('Error clearing lastSeenPost post state:', _);
        });
    }
}

class HNEnhancer {

    static DEBUG = false;  // Set to true when debugging

    logDebug(...args) {
        if (HNEnhancer.DEBUG) {
            console.log('[DEBUG] ', ...args);
        }
    }

    logInfo(...args) {
        console.log('[INFO] ', ...args);
    }

    static CHROME_AI_AVAILABLE = {
        YES: 'readily',
        NO: 'no',
        AFTER_DOWNLOAD: 'after-download'
    }

    constructor() {

        this.authorComments = this.createAuthorCommentsMap();    // Create a map of comment elements by author
        this.popup = this.createAuthorPopup();
        this.postAuthor = this.getPostAuthor();

        this.currentComment = null;         // Track currently focused comment

        this.helpModal = this.createHelpModal();

        this.createHelpIcon();

        // Initialize the page based on type - home page vs. comments page
        if (this.isHomePage) {

            this.currentPostIndex = -1;     // initialize to -1 to indicate that it is not set
            this.allPosts = null;

            this.initHomePageNavigation();

        } else if (this.isCommentsPage) {
            // Initialize custom navigation in Comments page - author comments, comment navigation and summary panel,
            this.initCommentsPageNavigation();

            // Navigate to first comment, but don't scroll to it (to avoid jarring effect when you first come to the page)
            this.navigateToFirstComment(false);

            this.initChromeBuiltinAI();

            this.summaryPanel = new SummaryPanel();
        }

        // set up all keyboard shortcuts - global and page-specific (Home pages vs. Comments page)
        this.setupKeyBoardShortcuts();
    }

    get isHomePage() {
        const pathname = window.location.pathname;
        return pathname === '/' || pathname === '/news' || pathname === '/newest' || pathname === '/ask' || pathname === '/show' || pathname === '/front' || pathname === '/shownew';
    }

    get isCommentsPage() {
        return window.location.pathname === '/item';
    }

    initHomePageNavigation() {
        this.allPosts = document.querySelectorAll('.athing');

        // check if there is a post id saved in the storage - if yes, restore it; else navigate to the first post
        HNState.getLastSeenPostId().then(lastSeenPostId => {

            let lastSeenPostIndex = -1;
            if (lastSeenPostId) {
                this.logDebug(`Got last seen post id from storage: ${lastSeenPostId}`);

                // Find the post with matching ID
                const posts = Array.from(this.allPosts);
                lastSeenPostIndex = posts.findIndex(post => this.getPostId(post) === lastSeenPostId);
            }

            // if we got a valid last seen post, set it as the current index, else go to the first post
            if (lastSeenPostIndex !== -1) {
                this.setCurrentPostIndex(lastSeenPostIndex);
            } else {
                this.navigateToPost('first');
            }
        });
    }

    getPostId(post) {
        // Extract post ID from the comments link
        const subtext = post.nextElementSibling;
        if (subtext) {
            const commentsLink = subtext.querySelector('a[href^="item?id="]');
            if (commentsLink) {
                const match = commentsLink.href.match(/id=(\d+)/);
                return match ? match[1] : null;
            }
        }
        return null;
    }

    navigateToPost(direction) {
        switch (direction) {
            case 'first':
                if(this.allPosts.length > 0) {
                    this.setCurrentPostIndex(0);
                }
                break;
            case 'next':
                const nextPostIndex = this.currentPostIndex + 1;
                if(nextPostIndex < this.allPosts.length) {
                    this.setCurrentPostIndex(nextPostIndex);
                } else {
                    this.logDebug(`Currently at the last post, cannot navigate further to next post.`);
                }
                break;
            case 'prev':
                const prevPostIndex = this.currentPostIndex - 1;
                if(prevPostIndex >= 0) {
                    this.setCurrentPostIndex(prevPostIndex);
                } else {
                    this.logDebug(`Currently at the first post, cannot navigate further to previous post.`);
                }
                break;
            default:
                console.error(`Cannot navigate to post. Unknown direction: ${direction}`);
                break;
        }
    }

    getCurrentPost() {
        if(this.currentPostIndex < 0 || this.currentPostIndex >= this.allPosts.length){
            this.logInfo(`No current post to return, because current post index is outside the bounds of the posts array. 
                            currentPostIndex: ${this.currentPostIndex}. allPosts.length: ${this.allPosts.length}`);
            return null;
        }

        return this.allPosts[this.currentPostIndex];
    }

    // sets the current post index and highlights the post at the given post index.
    //  Valid inputs: any number between 0 and the length of allPosts array
    setCurrentPostIndex(postIndex) {

        if(!this.allPosts) return;

        if(this.allPosts.length === 0) {
            this.logDebug(`No posts in this page, hence not setting the current post.`);
            return;
        }
        if(postIndex < 0 || postIndex >= this.allPosts.length) {
            console.error(`ERROR: cannot set current post because the given index is outside the bounds of the posts array. 
                            postIndex: ${postIndex}. allPosts.length: ${this.allPosts.length}`);
            return;
        }

        // un-highlight the current post before updating the post index.
        if(this.currentPostIndex >= 0) {
            const prevPost = this.allPosts[this.currentPostIndex];
            prevPost.classList.remove('highlight-post')
        }

        // update the post index if there is a valid post at that index
        const newPost = this.allPosts[postIndex];
        if(!newPost) {
            console.error(`Post at the new index is null. postIndex: ${postIndex}`);
            return;
        }

        this.currentPostIndex = postIndex;
        this.logDebug(`Updated current post index to ${postIndex}`);

        // save the id of the new post as the last seen post id in the storage
        const newPostId = this.getPostId(newPost);
        if(newPostId) {
            HNState.saveLastSeenPostId(newPostId);
            this.logDebug(`Saved current post id as last seen post id: ${newPostId}`);
        }

        // highlight the new post and scroll to it
        newPost.classList.add('highlight-post');
        newPost.scrollIntoView({behavior: 'smooth', block: 'center'});
    }

    initCommentsPageNavigation() {

        // Inject 'Summarize all comments' link at the top of the main post
        this.injectSummarizePostLink();

        // Go through all the comments in this post and inject all our nav elements - author, summarize etc.
        const allComments = document.querySelectorAll('.athing.comtr');

        allComments.forEach(comment => {

            // inject the author nav links - # of comments, left/right links to see comments by the same author
            this.injectAuthorCommentsNavLinks(comment);

            // customize the default next/prev/root/parent links to do the Companion behavior
            this.customizeDefaultNavLinks(comment);

            // Insert summarize thread link at the end
            this.injectSummarizeThreadLinks(comment);
        });

        // Set up the hover events on all user elements - in the main post subline and each comment
        this.setupUserHover();
    }

    injectAuthorCommentsNavLinks(comment) {
        const authorElement = comment.querySelector('.hnuser');
        if (authorElement && !authorElement.querySelector('.comment-count')) {
            const author = authorElement.textContent;
            const count = this.authorComments.get(author).length;

            const container = document.createElement('span');

            const countSpan = document.createElement('span');
            countSpan.className = 'comment-count';
            countSpan.textContent = `(${count})`;
            container.appendChild(countSpan);

            const navPrev = document.createElement('span');
            navPrev.className = 'author-nav nav-triangle';
            navPrev.textContent = '\u23F4';  // Unicode for left arrow '◀'
            navPrev.title = 'Go to previous comment by this author';
            navPrev.onclick = (e) => {
                e.preventDefault();
                this.navigateAuthorComments(author, comment, 'prev');
            };
            container.appendChild(navPrev);

            const navNext = document.createElement('span');
            navNext.className = 'author-nav nav-triangle';
            navNext.textContent = '\u23F5';   // Unicode for right arrow '▶'
            navNext.title = 'Go to next comment by this author';
            navNext.onclick = (e) => {
                e.preventDefault();
                this.navigateAuthorComments(author, comment, 'next');
            };
            container.appendChild(navNext);

            if (author === this.postAuthor) {
                const authorIndicator = document.createElement('span');
                authorIndicator.className = 'post-author';
                authorIndicator.textContent = '👑';
                authorIndicator.title = 'Post Author';
                container.appendChild(authorIndicator);
            }

            const separator = document.createElement("span");
            separator.className = "author-separator";
            separator.textContent = "|";
            container.appendChild(separator);

            // Get the parent element of the author element and append the container as second child
            authorElement.parentElement.insertBefore(container, authorElement.parentElement.children[1]);
        }
    }

    injectSummarizeThreadLinks(comment) {
        const navsElement = comment.querySelector('.navs');
        if(!navsElement) {
            console.error('Could not find the navs element to inject the summarize thread link');
            return;
        }

        navsElement.appendChild(document.createTextNode(' | '));

        const summarizeThreadLink = document.createElement('a');
        summarizeThreadLink.href = '#';
        summarizeThreadLink.textContent = 'summarize thread';
        summarizeThreadLink.title = 'Summarize all child comments in this thread';

        summarizeThreadLink.addEventListener('click', async (e) => {
            e.preventDefault();

            // Set the current comment and summarize the thread starting from this comment
            this.setCurrentComment(comment);

            await this.summarizeThread(comment);
        });

        navsElement.appendChild(summarizeThreadLink);
    }

    createAuthorCommentsMap() {
        const authorCommentsMap = new Map();

        // Get all comments in this post
        const comments = document.querySelectorAll('.athing.comtr');

        // Count comments by author and the author comments elements by author
        comments.forEach(comment => {

            // save the author comments mapping (comments from each user in this post)
            const authorElement = comment.querySelector('.hnuser');
            if (authorElement) {
                const author = authorElement.textContent;

                if (!authorCommentsMap.has(author)) {
                    authorCommentsMap.set(author, []);
                }
                authorCommentsMap.get(author).push(comment);
            }
        });

        return authorCommentsMap;
    }

    createHelpIcon() {
        const icon = document.createElement('div');
        icon.className = 'help-icon';
        icon.innerHTML = '?';
        icon.title = 'Keyboard Shortcuts (Press ? or / to toggle)';

        icon.onclick = () => this.toggleHelpModal(true);

        document.body.appendChild(icon);
        return icon;
    }

    toggleHelpModal(show) {
        this.helpModal.style.display = show ? 'flex' : 'none';
    }

    createAuthorPopup() {
        const popup = document.createElement('div');
        popup.className = 'author-popup';
        document.body.appendChild(popup);
        return popup;
    }

    getPostAuthor() {
        const postAuthorElement = document.querySelector('.fatitem .hnuser');
        return postAuthorElement ? postAuthorElement.textContent : null;
    }

    async sendBackgroundMessage(type, data) {
        this.logDebug(`Sending browser runtime message ${type}:`, data);

        let response;
        const startTime = performance.now();
        let duration = 0;

        try {
            response = await chrome.runtime.sendMessage({type, data});

            const endTime = performance.now();
            duration = Math.round((endTime - startTime) / 1000);

            this.logDebug(`Got response from background message '${type}' in ${duration}s. URL: ${data.url || 'N/A'}`);

        } catch (error) {
            const endTime = performance.now();
            duration = Math.round((endTime - startTime) / 1000);

            const errorMessage = `Error sending background message '${type}' URL: ${data?.url || 'N/A'}. Duration: ${duration}s. Error: ${error.message}`;
            console.error(errorMessage);
            throw new Error(errorMessage);
        }

        if (!response) {
            console.error(`No response from background message ${type}`);
            throw new Error(`No response from background message ${type}`);
        }
        if (!response.success) {
            console.error(`Error response from background message ${type}:`, response.error);
            throw new Error(response.error);
        }

        // Add the duration to the response for displaying in the summary panel
        response.data.duration = duration;
        return response.data;
    }

    async fetchUserInfo(username) {
        try {
            const data = await this.sendBackgroundMessage(
                'FETCH_API_REQUEST',
                {
                    url: `https://hn.algolia.com/api/v1/users/${username}`,
                    method: 'GET'
                }
            );

            return {
                karma: data.karma || 'Not found',
                about: data.about || 'No about information'
            };
        } catch (error) {
            return {
                karma: 'User info error',
                about: 'No about information'
            };
        }
    }

    setupKeyBoardShortcuts() {

        // Shortcut keys specific to the Comments page
        const doubleKeyShortcuts = {
            'comments': {
                // Double key combinations
                'g+g': () => {
                    // Go to first comment
                    const currentTime = Date.now();
                    if (lastKey === 'g' && currentTime - lastKeyPressTime < 500) {
                        this.navigateToFirstComment();
                    }

                    // Update the last key and time so that we can handle the repeated press in the next iteration
                    lastKey = 'g';
                    lastKeyPressTime = currentTime;
                }
            },
            'home': {
                'g+g': () => {
                    // Go to first post
                    const currentTime = Date.now();
                    if (lastKey === 'g' && currentTime - lastKeyPressTime < 500) {
                        this.navigateToPost('first');
                    }

                    // Update tracking for next potential combination
                    lastKey = 'g';
                    lastKeyPressTime = currentTime;
                }
            }
        }

        // Shortcut keys specific to Home Page
        const homePageKeyboardShortcuts = this.getHomePageKeyboardShortcuts();

        // Shortcut keys specific to Comments page
        const commentsPageKeyboardShortcuts  = this.getCommentsPageKeyboardShortcuts();

        // Shortcut keys common to all pages (Comments, Home)
        const globalKeyboardShortcuts = this.getGlobalKeyboardShortcuts();

        // Track last key press
        let lastKey = null;
        let lastKeyPressTime = 0;
        const KEY_COMBO_TIMEOUT = 1000; // 1 second timeout for combinations

        document.addEventListener('keydown', (e) => {

            // Handle key press only when it is not in an input field and not Ctrl / Cmd keys.
            //  This will allow the default behavior when these keys are pressed
            const isInputField = e.target.matches('input, textarea, select, [contenteditable="true"]');
            if(isInputField || e.ctrlKey || e.metaKey) {
                return;
            }

            this.logDebug(`Pressed key: ${e.key}. Shift key: ${e.shiftKey}`);

            const currentTime = Date.now();
            let shortcutKey = e.key;

            // check if this is a shifted key (eg: '?'), if so, treat it as a single key
            const shiftedKeys = ['?'];
            const isShiftedKey = e.shiftKey && shiftedKeys.includes(e.key);

            if (!isShiftedKey) {
                // Check for key combination for non-shifted keys
                if (lastKey && (currentTime - lastKeyPressTime) < KEY_COMBO_TIMEOUT) {
                    shortcutKey = `${lastKey}+${shortcutKey}`;
                }
            }


            // Look for a handler for the given shortcut key in the key->handler mapping
            //  - first in the page-specific keys, then in the global shortcuts.
            const pageShortcuts = this.isHomePage ? {
                ...homePageKeyboardShortcuts,
                ...(doubleKeyShortcuts['home'] || {})
            } : this.isCommentsPage ? {
                ...commentsPageKeyboardShortcuts,
                ...(doubleKeyShortcuts['comments'] || {})
            } : {};

            this.logDebug('Selected page shortcuts:', Object.keys(pageShortcuts));

            const shortcutHandler = pageShortcuts[shortcutKey] || globalKeyboardShortcuts[shortcutKey];

            this.logDebug(`Shortcut key: ${shortcutKey}. Handler found? ${!!shortcutHandler}`);

            // If we have a handler for this key or combination, invoke it
            if (shortcutHandler) {
                e.preventDefault();
                shortcutHandler();

                // Reset after successful combination
                lastKey = null;
                lastKeyPressTime = 0;
            } else {
                // Update tracking for potential combination
                lastKey = shortcutKey;
                lastKeyPressTime = currentTime;
            }
        });
    }

    getHomePageKeyboardShortcuts() {
        return {
            'j': () => {
                // Next post
                this.navigateToPost('next');
            },
            'k': () => {
                // Previous post
                this.navigateToPost('prev');
            },
            'o': () => {
                // Open post in new tab
                const currentPost = this.getCurrentPost();
                if(!currentPost) return;

                const postLink = currentPost.querySelector('.titleline a');
                if (postLink) {
                    window.open(postLink.href, '_blank');
                }
            },
            'c': () => {
                // Open comments page
                const currentPost = this.getCurrentPost();
                if(!currentPost) return;

                if (currentPost.nextElementSibling) {
                    const subtext = currentPost.nextElementSibling;
                    const commentsLink = subtext.querySelector('a[href^="item?id="]');
                    if (commentsLink) {
                        window.location.href = commentsLink.href;
                    }
                }
            }
        }
    }

    getCommentsPageKeyboardShortcuts() {
        return {
            'j': () => {
                // Next comment at same depth
                // Find the 'next' hyperlink in the HN nav panel and set that as the current comment.
                const nextComment = this.getNavElementByName(this.currentComment, 'next');
                if (nextComment) {
                    this.setCurrentComment(nextComment);
                }
            },
            'k': () => {
                // Previous comment at same depth (same as 'prev' hyperlink)
                // Find the 'prev' hyperlink in the HN nav panel and set that as the current comment.
                const prevComment = this.getNavElementByName(this.currentComment, 'prev');
                if (prevComment) {
                    this.setCurrentComment(prevComment);
                }
            },
            'l': () => {
                // Next child. If you are at the last child, it will go to the next sibling comment
                this.navigateToChildComment();
            },
            'h': () => {
                // Parent comment (same as 'parent' hyperlink)
                // Find the 'parent' hyperlink in the HN nav panel and set that as the current comment.
                const parentComment = this.getNavElementByName(this.currentComment, 'parent');
                if (parentComment) {
                    this.setCurrentComment(parentComment);
                }
            },
            'r': () => {
                // Find the 'root' hyperlink in the HN nav panel and set that as the current comment.
                const rootComment = this.getNavElementByName(this.currentComment, 'root');
                if (rootComment) {
                    this.setCurrentComment(rootComment);
                }
            },
            '[': () => {
                //  Previous comment by the same author
                const authorElement = this.currentComment.querySelector('.hnuser');
                if (authorElement) {
                    const author = authorElement.textContent;
                    this.navigateAuthorComments(author, this.currentComment, 'prev');
                }
            },
            ']': () => {
                // Next comment by the same author
                const authorElement = this.currentComment.querySelector('.hnuser');
                if (authorElement) {
                    const author = authorElement.textContent;
                    this.navigateAuthorComments(author, this.currentComment, 'next');
                }
            },
            'z': () => {
                // Scroll to current comment
                if (this.currentComment) {
                    this.currentComment.scrollIntoView({behavior: 'smooth', block: 'center'});
                }
            },
            'c': () => {
                // Collapse/expand current comment
                if (this.currentComment) {
                    const toggleLink = this.currentComment.querySelector('.togg');
                    if (toggleLink) {
                        toggleLink.click();
                    }
                }
            },
            'o': () => {
                // Open the original post in new tab
                const postLink = document.querySelector('.titleline a');
                if (postLink) {
                    window.open(postLink.href, '_blank');
                }
            },
            's': () => {
                // Open/close the summary panel on the right
                this.summaryPanel.toggle();

            },
        }
    }

    getGlobalKeyboardShortcuts() {
        return {
            '?': () => {
                // Open/close the help modal
                this.toggleHelpModal(this.helpModal.style.display === 'none');
            },
            '/': () => {
                // Open/close the help modal
                this.toggleHelpModal(this.helpModal.style.display === 'none');
            },
            'Escape': () => {
                // Close the help modal if it is open
                if (this.helpModal.style.display !== 'none') {
                    this.toggleHelpModal(false);
                }
            },
        }
    }

    navigateToFirstComment(scrollToComment = true) {
        const firstComment = document.querySelector('.athing.comtr');
        if (firstComment) {
            this.setCurrentComment(firstComment, scrollToComment);
        }
    }

    navigateToChildComment() {
        if (!this.currentComment) return;

        // The comments are arranged as a flat array of table rows where the hierarchy is represented by the depth of the element.
        //  So the next child is the next comment element in the array.
        let next = this.currentComment.nextElementSibling;

        while (next) {
            // Look for the element with the style classes of comment. If found, return. If not, continue to the next sibling.
            if (next.classList.contains('athing') && next.classList.contains('comtr')) {
                this.setCurrentComment(next);
                return; // Found the next child
            }
            next = next.nextElementSibling;
        }
    }

    getNavElementByName(comment, elementName) {
        if (!comment) return;

        // Get HN's default navigation panel and locate the nav element by the given name ('root', 'parent', 'next' or 'prev').
        const hyperLinks = comment.querySelectorAll('.comhead .navs a');
        if (hyperLinks) {
            // Find the <a href> with text that matches the given name
            const hyperLink = Array.from(hyperLinks).find(a => a.textContent.trim() === elementName);
            if (hyperLink) {
                const commentId = hyperLink.hash.split('#')[1];
                const element = document.getElementById(commentId);
                return element;
            }
        }
    }

    setCurrentComment(comment, scrollIntoView = true) {
        if (!comment) return;

        // Un-highlight the current comment's author before updating the current comment.
        //  Note: when this method is called the first time, this.currentComment will be null and it is ok.
        if(this.currentComment) {
            const prevAuthorElement = this.currentComment.querySelector('.hnuser');
            if (prevAuthorElement) {
                prevAuthorElement.classList.remove('highlight-author');
            }
        }

        // update the current comment
        this.currentComment = comment;

        // Highlight the new comment's author
        const newAuthorElement = comment.querySelector('.hnuser');
        if (newAuthorElement) {
            newAuthorElement.classList.add('highlight-author');
        }

        // Scroll to the new comment element if asked for. Scroll to the center of the page instead of the top
        //   so that we can see a little bit of the previous comments.
        if (scrollIntoView) {
            comment.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
    }

    convertMarkdownToHTML(markdown) {
        // Helper function to wrap all lists as unordered lists
        function wrapLists(html) {
            // Wrap any sequence of list items in ul tags
            return html.replace(/<li>(?:[^<]|<(?!\/li>))*<\/li>(?:\s*<li>(?:[^<]|<(?!\/li>))*<\/li>)*/g,
                match => `<ul>${match}</ul>`);
        }

        // First escape HTML special characters
        let html = markdown
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Convert markdown to HTML
        // noinspection RegExpRedundantEscape,HtmlUnknownTarget
        html = html
            // Headers
            .replace(/^##### (.*$)/gim, '<h5>$1</h5>')
            .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')

            // Blockquotes
            .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')

            // Code blocks and inline code
            .replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')

            //  both bullet points and numbered lists to li elements
            .replace(/^\s*[\-\*]\s(.+)/gim, '<li>$1</li>')
            .replace(/^\s*(\d+)\.\s(.+)/gim, '<li>$2</li>')

            // Bold and Italic
            .replace(/\*\*(?=\S)([^\*]+?\S)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(?=\S)([^\*]+?\S)\*/g, '<em>$1</em>')
            .replace(/_(?=\S)([^\*]+?\S)_/g, '<em>$1</em>')

            // Images and links
            .replace(/!\[(.*?)\]\((.*?)\)/gim, "<img alt='$1' src='$2' />")
            .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2'>$1</a>")

            // Horizontal rules
            .replace(/^\s*[\*\-_]{3,}\s*$/gm, '<hr>')

            // Paragraphs and line breaks
            .replace(/\n\s*\n/g, '</p><p>')
        // .replace(/\n/g, '<br />');

        // Wrap all lists as unordered lists
        html = wrapLists(html);

        // Wrap everything in paragraphs if not already wrapped
        if (!html.startsWith('<')) {
            html = `<p>${html}</p>`;
        }

        return html.trim();
    }

    createHelpModal() {
        const modal = document.createElement('div');
        modal.className = 'keyboard-help-modal';
        modal.style.display = 'none';

        const content = document.createElement('div');
        content.className = 'keyboard-help-content';

        const title = document.createElement('h2');
        title.textContent = 'HN Companion: Keyboard Shortcuts';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'help-close-btn';
        closeBtn.textContent = '×';
        closeBtn.onclick = () => this.toggleHelpModal(false);

        const shortcutGroups = {
            "global": {
                title: 'Global',
                shortcuts: [
                    {key: 'o', description: 'Open post in new window'},
                    {key: '? /', description: 'Toggle this help panel'}
                ]
            },
            "home": {
                title: 'Home Pages (Home, New, Past, Ask, Show)',
                shortcuts: [
                    {key: 'j k', description: 'Next/previous post'},
                    {key: 'c', description: 'Open comments page'}
                ]
            },
            "comments": {
                title: 'Post Details Page',
                shortcuts: [
                    {key: 'j k', description: 'Next/previous comment'},
                    {key: 'l h', description: 'Next child/parent comment'},
                    {key: '[ ]', description: 'Prev/next comment by author'},
                    {key: 's', description: 'Toggle summary panel'},
                    {key: 'r', description: 'Go to root comment'},
                    {key: 'gg', description: 'First comment'},
                    {key: 'z', description: 'Scroll to current'},
                    {key: 'c', description: 'Collapse/expand comment'}
                ]
            }
        };

        const table = document.createElement('table');

        for (const groupKey in shortcutGroups) {
            const group = shortcutGroups[groupKey];  // Get the actual group object

            const headerRow = table.insertRow();
            const headerCell = headerRow.insertCell();
            headerCell.colSpan = 2;  // Span both columns
            headerRow.className = 'group-header';

            const subHeading = document.createElement('h3');
            subHeading.textContent = group.title;
            headerCell.appendChild(subHeading);

            group.shortcuts.forEach(shortcut => {
                const shortcutRow = table.insertRow();

                const keyCell = shortcutRow.insertCell();

                // Keys could be 'l', 'h' for single keys, 'gg' for repeated keys or '?|/' for multiple keys
                const keys = shortcut.key.split(' ');
                keys.forEach((k, index) => {
                    const keySpan = document.createElement('span');
                    keySpan.className = 'key';
                    keySpan.textContent = k;
                    keyCell.appendChild(keySpan);

                    if (index < keys.length - 1) {
                        const separator = document.createElement('span');
                        separator.textContent = ' or ';
                        keyCell.appendChild(separator);
                    }
                });

                const descCell = shortcutRow.insertCell();
                descCell.textContent = shortcut.description;
            });
        }

        content.appendChild(closeBtn);
        content.appendChild(title);
        content.appendChild(table);

        const footer = document.createElement('div');
        footer.className = 'keyboard-help-footer';
        footer.innerHTML = 'Learn more about features and updates on our <a href="https://github.com/levelup-apps/hn-enhancer/" target="_blank" rel="noopener">GitHub page</a> ↗️';
        content.appendChild(footer);

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            e.preventDefault();
            if (e.target === modal) {
                this.toggleHelpModal(false);
            }
        });

        return modal;
    }

    async summarizeThread(comment) {

        // Get the item id from the 'age' link that shows '10 hours ago' or similar
        const itemLinkElement = comment.querySelector('.age')?.getElementsByTagName('a')[0];
        if (!itemLinkElement) {
            console.error('Could not find the item link element to get the item id for summarization');
            return;
        }

        // get the content of the thread
        const itemId = itemLinkElement.href.split('=')[1];
        const {formattedComment, commentPathToIdMap} = await this.getHNThread(itemId);
        if (!formattedComment) {
            console.error(`Could not get the thread for summarization. item id: ${itemId}`);
            return;
        }

        const commentDepth = commentPathToIdMap.size;
        const {aiProvider, model} = await this.getAIProviderModel();

        if (!aiProvider) {
            console.log('AI provider not configured. Prompting user to complete setup.');
            this.showConfigureAIMessage();
            return;
        }

        const authorElement = comment.querySelector('.hnuser');
        const author = authorElement.textContent || '';
        const highlightedAuthor = `<span class="highlight-author">${author}</span>`;

        const summarizeCheckResult = this.shouldSummarizeText(formattedComment, commentDepth, aiProvider);

        if (summarizeCheckResult.status !== SummarizeCheckStatus.OK) {
            const messageTemplates = {
                title: 'Summarization not recommended',
                metadata: {
                    [SummarizeCheckStatus.TEXT_TOO_SHORT]: `Thread too brief to use the selected cloud AI <strong>${aiProvider}</strong>`,
                    [SummarizeCheckStatus.THREAD_TOO_SHALLOW]: `Thread not deep enough to use the selected cloud AI <strong>${aiProvider}</strong>`,
                    [SummarizeCheckStatus.THREAD_TOO_DEEP]: `Thread too deep for the selected AI <strong>${aiProvider}</strong>`
                },
                text: (status, highlightedAuthor) => {
                    return status === SummarizeCheckStatus.THREAD_TOO_DEEP
                        ? `This ${highlightedAuthor} thread is too long or deeply nested to be handled by Chrome Built-in AI. The underlying model Gemini Nano may struggle and hallucinate with large content and deep nested threads due to model size limitations. This model works best with individual comments or brief discussion threads. 
                        <br/><br/>However, if you still want to summarize this thread, you can <a href="#" id="options-page-link">configure another AI provider</a> like local <a href="https://ollama.com/" target="_blank">Ollama</a> or cloud AI services like OpenAI or Claude.`

                        : `This ${highlightedAuthor} thread is concise enough to read directly. Summarizing short threads with a cloud AI service would be inefficient. 
                        <br/><br/> However, if you still want to summarize this thread, you can <a href="#" id="options-page-link">configure a local AI provider</a> like <a href="https://developer.chrome.com/docs/ai/built-in" target="_blank">Chrome Built-in AI</a> or <a href="https://ollama.com/" target="_blank">Ollama</a> for more efficient processing of shorter threads.`;
                }
            };

            this.summaryPanel.updateContent({
                title: messageTemplates.title,
                metadata: messageTemplates.metadata[summarizeCheckResult.status],
                text: messageTemplates.text(summarizeCheckResult.status, highlightedAuthor)
            });

            // Once the error message is rendered in the summary panel, add the click handler for the Options page link
            const optionsLink = this.summaryPanel.panel.querySelector('#options-page-link');
            if (optionsLink) {
                optionsLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.openOptionsPage();
                });
            }
            return;
        }

        // Show an in-progress text in the summary panel
        const metadata = `Analyzing discussion in ${highlightedAuthor} thread`;
        const modelInfo = aiProvider ? ` using <strong>${aiProvider} ${model || ''}</strong>` : '';

        this.summaryPanel.updateContent({
            title: 'Thread Summary',
            metadata: metadata,
            text: `<div>Generating summary${modelInfo}... This may take a few moments.<span class="loading-spinner"></span></div>`
        });

        this.summarizeTextWithAI(formattedComment, commentPathToIdMap);
    }

    shouldSummarizeText(formattedText, commentDepth, aiProvider) {
        // Ollama can handle all kinds of data - large, small, deep threads. So return true
        if (aiProvider === 'ollama') {
            return { status: SummarizeCheckStatus.OK };
        }

        // Chrome Built-in AI cannot handle deep threads, so limit the summarization to a certain depth
        if (aiProvider === 'chrome-ai') {
            return commentDepth <= 5
                ? { status: SummarizeCheckStatus.OK }
                : { status: SummarizeCheckStatus.THREAD_TOO_DEEP };
        }

        // OpenAI and Claude can handle larger data, but they are expensive, so there should be a minimum length and depth
        const minSentenceLength = 8;
        const minCommentDepth = 3;
        const sentences = formattedText.split(/[.!?]+(?:\s+|$)/)
            .filter(sentence => sentence.trim().length > 0);

        if (sentences.length <= minSentenceLength) {
            return { status: SummarizeCheckStatus.TEXT_TOO_SHORT };
        }
        if (commentDepth <= minCommentDepth) {
            return { status: SummarizeCheckStatus.THREAD_TOO_SHALLOW };
        }

        return { status: SummarizeCheckStatus.OK };
    }

    // Customize the default HN navigation such that it is synchronized with our navigation.
    //  When the user clicks next / prev / root / parent links, the new comment should be highlighted.
    customizeDefaultNavLinks(comment) {
        const hyperLinks = comment.querySelectorAll('.comhead .navs a');
        if (!hyperLinks) return;

        // Find the <a href> with text that have a hash ('#<comment_id>') and add click event listener
        const navLinks = Array.from(hyperLinks).filter(link => link.hash.length > 0);

        navLinks.forEach(link => {
            link.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation(); // stop the default link navigation

                const targetComment = this.getNavElementByName(comment, link.textContent.trim());
                if (targetComment) {
                    this.setCurrentComment(targetComment);
                }
            };
        });
    }

    navigateAuthorComments(author, currentComment, direction) {
        const comments = this.authorComments.get(author);
        if (!comments) return;

        const currentIndex = comments.indexOf(currentComment);
        if (currentIndex === -1) return;

        let targetIndex;
        if (direction === 'prev') {
            targetIndex = currentIndex > 0 ? currentIndex - 1 : comments.length - 1;
        } else {
            targetIndex = currentIndex < comments.length - 1 ? currentIndex + 1 : 0;
        }

        const targetComment = comments[targetIndex];
        this.setCurrentComment(targetComment);
    }

    setupUserHover() {
        document.querySelectorAll('.hnuser').forEach(authorElement => {
            authorElement.addEventListener('mouseenter', async (e) => {
                const username = e.target.textContent.replace(/[^a-zA-Z0-9_-]/g, '');
                const userInfo = await this.fetchUserInfo(username);

                if (userInfo) {
                    this.popup.innerHTML = `
                        <strong>${username}</strong><br>
                        Karma: ${userInfo.karma}<br>
                        About: ${userInfo.about}
                      `;

                    const rect = e.target.getBoundingClientRect();
                    this.popup.style.left = `${rect.left}px`;
                    this.popup.style.top = `${rect.bottom + window.scrollY + 5}px`;
                    this.popup.style.display = 'block';
                }
            });

            authorElement.addEventListener('mouseleave', () => {
                this.popup.style.display = 'none';
            });
        });

        // Add global event listeners to close the user popup on Esc key or clock outside the user element

        // Add event listener for Esc key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.popup.style.display = 'none';
            }
        });

        // Add event listener for clicks outside the popup
        document.addEventListener('click', (e) => {
            if (!this.popup.contains(e.target) && !e.target.classList.contains('hnuser')) {
                this.popup.style.display = 'none';
            }
        });
    }

    initChromeBuiltinAI() {

        // Inject the origin trial token to enable Summarization API for origin 'news.ycombinator.com'
        const otMeta = document.createElement('meta');
        otMeta.httpEquiv = 'origin-trial';
        otMeta.content = 'Ah+d1HFcvvHgG3aB5OfzNzifUv02EpQfyQBlED1zXGCt8oA+XStg86q5zAwr7Y/UFDCmJEnPi019IoJIoeTPugsAAABgeyJvcmlnaW4iOiJodHRwczovL25ld3MueWNvbWJpbmF0b3IuY29tOjQ0MyIsImZlYXR1cmUiOiJBSVN1bW1hcml6YXRpb25BUEkiLCJleHBpcnkiOjE3NTMxNDI0MDB9';
        document.head.prepend(otMeta);

        this.isChomeAiAvailable = HNEnhancer.CHROME_AI_AVAILABLE.NO;

        function parseAvailable(available) {
            switch (available) {
                case 'readily':
                    return HNEnhancer.CHROME_AI_AVAILABLE.YES;
                case 'no':
                    return HNEnhancer.CHROME_AI_AVAILABLE.NO;
                case 'after-download':
                    return HNEnhancer.CHROME_AI_AVAILABLE.AFTER_DOWNLOAD;
            }
            return HNEnhancer.CHROME_AI_AVAILABLE.NO;
        }


        // 1. Inject the script into the webpage's context
        const pageScript = document.createElement('script');
        pageScript.src = chrome.runtime.getURL('page-script.js');
        (document.head || document.documentElement).appendChild(pageScript);

        pageScript.onload = () => {
            window.postMessage({
                type: 'HN_CHECK_AI_AVAILABLE',
                data: {}
            });
        }

        // 2. Listen for messages from the webpage
        window.addEventListener('message', (event) => {

            // reject all messages from other domains
            if (event.origin !== window.location.origin) {
                return;
            }

            // this.logDebug('content.js - Received message:', event.type, JSON.stringify(event.data));

            // Handle different message types
            switch (event.data.type) {
                case 'HN_CHECK_AI_AVAILABLE_RESPONSE':
                    const available = event.data.data.available;

                    this.isChomeAiAvailable = parseAvailable(available);
                    this.logDebug('Message from page script Chrome Built-in AI. HN_CHECK_AI_AVAILABLE_RESPONSE: ', this.isChomeAiAvailable);
                    break;

                case 'HN_AI_SUMMARIZE_RESPONSE':
                    const responseData = event.data.data;
                    if(responseData.error) {
                        this.summaryPanel.updateContent({
                            title: 'Summarization Error',
                            text: responseData.error
                        });
                        return;
                    }

                    // Summarization success. Show the summary in the panel
                    const summary = responseData.summary;
                    const commentPathToIdMap = responseData.commentPathToIdMap;
                    this.showSummaryInPanel(summary, commentPathToIdMap).catch(error => {
                        console.error('Error showing summary:', error);
                    });

                    break;

                default:
                    break;
            }
        });
    }

    injectSummarizePostLink() {
        const navLinks = document.querySelector('.subtext .subline');
        if (!navLinks) return;

        const summarizeLink = document.createElement('a');
        summarizeLink.href = '#';
        summarizeLink.textContent = 'summarize all comments';

        summarizeLink.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.summarizeAllComments();
        });

        navLinks.appendChild(document.createTextNode(' | '));
        navLinks.appendChild(summarizeLink);
    }

    async getAIProviderModel() {
        const settingsData = await chrome.storage.sync.get('settings');
        const aiProvider = settingsData.settings?.providerSelection;
        const model = settingsData.settings?.[aiProvider]?.model;
        return {aiProvider, model};
    }

    async summarizeAllComments() {
        const itemId = this.getCurrentHNItemId();
        if (!itemId) {
            console.error(`Could not get item id of the current port to summarize all comments in it.`);
            return;
        }

        try {
            if (!this.summaryPanel.isVisible) {
                this.summaryPanel.toggle();
            }

            const {aiProvider, model} = await this.getAIProviderModel();

            // Soon after installing the extension, the settings may not be available. Show a message to configure the AI provider.
            if(!aiProvider) {
                console.log('AI provider not configured. Prompting user to complete setup.');
                this.showConfigureAIMessage();
                return;
            }

            // If the AI provider is Chrome Built-in AI, do not summarize because it does not handle long text.
            if(aiProvider === 'chrome-ai') {

                this.summaryPanel.updateContent({
                    title: `Summarization not recommended`,
                    metadata: `Content too long for the selected AI <strong>${aiProvider}</strong>`,
                    text: `This post is too long to be handled by Chrome Built-in AI. The underlying model Gemini Nano may struggle and hallucinate with large content and deep nested threads due to model size limitations. This model works best with individual comments or brief discussion threads. 
                    <br/><br/>However, if you still want to summarize this thread, you can <a href="#" id="options-page-link">configure another AI provider</a> like local <a href="https://ollama.com/" target="_blank">Ollama</a> or cloud AI services like OpenAI or Claude.`
                });

                // Once the error message is rendered in the summary panel, add the click handler for the Options page link
                const optionsLink = this.summaryPanel.panel.querySelector('#options-page-link');
                if (optionsLink) {
                    optionsLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        this.openOptionsPage();
                    });
                }
                return;
            }
            // Show a meaningful in-progress message before starting the summarization
            const modelInfo = aiProvider ? ` using <strong>${aiProvider} ${model || ''}</strong>` : '';
            this.summaryPanel.updateContent({
                title: 'Post Summary',
                metadata: `Analyzing all threads in this post...`,
                text: `<div>Generating summary${modelInfo}... This may take a few moments. <span class="loading-spinner"></span></div>`
            });

            const {formattedComment, commentPathToIdMap} = await this.getHNThread(itemId);
            this.summarizeTextWithAI(formattedComment, commentPathToIdMap);

        } catch (error) {
            console.error('Error preparing for summarization:', error);
            this.summaryPanel.updateContent({
                title: 'Summarization Error',
                metadata: '',
                text: `Error preparing for summarization: ${error.message}`
            });
        }
    }

    getCurrentHNItemId() {
        const itemIdMatch = window.location.search.match(/id=(\d+)/);
        return itemIdMatch ? itemIdMatch[1] : null;
    }

    async fetchHNCommentsFromAPI(itemId) {
        const commentsJson = await this.sendBackgroundMessage(
            'FETCH_API_REQUEST',
            {
                url: `https://hn.algolia.com/api/v1/items/${itemId}`,
                method: 'GET'
            }
        );
        return commentsJson;
    }

    async getHNThread(itemId) {
        try {
            // Here, we will get the post with the itemId, parse the comments and enhance it with a better structure and score
            //  Get the comments from the HN API as well as the DOM.
            //  API comments are in JSON format structured as a tree and represents the hierarchy of comments.
            //  DOM comments (comments in the HTML page) are in the right sequence according to the up votes.

            const commentsJson = await this.fetchHNCommentsFromAPI(itemId);
            const commentsInDOM = this.getCommentsFromDOM();

            // Merge the two data sets to structure the comments based on hierarchy, votes and position
            const enhancedComments = this.enrichPostComments(commentsJson, commentsInDOM);

            // Create the path-to-id mapping in order to backlink the comments to the main page.
            const commentPathToIdMap = new Map();
            enhancedComments.forEach((comment, id) => {
                commentPathToIdMap.set(comment.path, id);
            });

            // Convert structured comments to formatted text
            const formattedComment = [...enhancedComments.values()]
                .map(comment => {
                    return [
                        `[${comment.path}]`,
                        `(score: ${comment.score})`,
                        `<replies: ${comment.replies}>`,
                        `{downvotes: ${comment.downvotes}}`,
                        `${comment.author}:`,
                        comment.text
                    ].join(' ') + '\n';
                })
                .join('');

            this.logDebug('formattedComment...', formattedComment);
            // this.logDebug('commentPathToIdMap...', JSON.stringify([...commentPathToIdMap.entries()]));

            return {
                formattedComment,
                commentPathToIdMap
            };
        } catch (error) {
            console.error(`Error: ${error.message}`);
        }
    }

    getCommentsFromDOM() {

        // Comments in the DOM are arranged according to their up votes. This gives us the position of the comment.
        //  We will also extract the downvotes and text of the comment (after sanitizing it).
        // Create a map to store comment positions, downvotes and the comment text.
        const commentsInDOM = new Map();

        // Step 1: collect all comments and their metadata
        const commentRows = document.querySelectorAll('.comtr');
        this.logDebug(`Found ${commentRows.length} DOM comments in post`);

        let skippedComments = 0;
        commentRows.forEach((commentRow, index) => {

            // if comment is flagged, it will have the class "coll" (collapsed) or "noshow" (children of collapsed comments)
            // if the commText class is not found, the comment is deleted or not visible.
            // Check for these two conditions and skip it.
            const commentFlagged = commentRow.classList.contains('coll') || commentRow.classList.contains('noshow');
            const commentTextDiv = commentRow.querySelector('.commtext');
            if( commentFlagged || !commentTextDiv ) {
                skippedComments++;
                return;
            }

            // Step 2: Sanitize the comment text (remove unnecessary html tags, encodings)
            function sanitizeCommentText() {

                // Clone the comment div so that we don't modify the DOM of the main page
                const tempDiv = commentTextDiv.cloneNode(true);

                // Remove unwanted HTML elements from the clone
                [...tempDiv.querySelectorAll('a, code, pre')].forEach(element => element.remove());

                // Replace <p> tags with their text content
                tempDiv.querySelectorAll('p').forEach(p => {
                    const text = p.textContent;
                    p.replaceWith(text);
                });

                // decode the HTML entities (to remove url encoding and new lines)
                function decodeHTML(html) {
                    const txt = document.createElement('textarea');
                    txt.innerHTML = html;
                    return txt.value;
                }

                // Remove unnecessary new lines and decode HTML entities
                const sanitizedText = decodeHTML(tempDiv.innerHTML).replace(/\n+/g, ' ');

                return sanitizedText;
            }
            const commentText = sanitizeCommentText();

            // Step 3: Get the down votes of the comment in order to calculate the score later
            // Downvotes are represented by the color of the text. The color is a class name like 'c5a', 'c73', etc.
            function getDownvoteCount(commentTextDiv) {

                // Downvotes are represented by the color of the text. The color is a class name like 'c5a', 'c73', etc.
                const downvotePattern = /c[0-9a-f]{2}/;

                // Find the first class that matches the downvote pattern
                const downvoteClass = [...commentTextDiv.classList.values()]
                    .find(className => downvotePattern.test(className.toLowerCase()))
                    ?.toLowerCase();

                if (!downvoteClass) {
                    return 0;
                }

                const downvoteMap = {
                    'c00': 0,
                    'c5a': 1,
                    'c73': 2,
                    'c82': 3,
                    'c88': 4,
                    'c9c': 5,
                    'cae': 6,
                    'cbe': 7,
                    'cce': 8,
                    'cdd': 9
                };
                return downvoteMap[downvoteClass] || 0;
            }
            const downvotes = getDownvoteCount(commentTextDiv);

            const commentId = commentRow.getAttribute('id');

            // Step 4: Add the position, text and downvotes of the comment to the map
            commentsInDOM.set(Number(commentId), {
                position: index,
                text: commentText,
                downvotes: downvotes,
            });

        });

        this.logDebug(`...Comments from DOM:: Total: ${commentRows.length}. Skipped (flagged): ${skippedComments}. Remaining: ${commentsInDOM.size}`);

        return commentsInDOM;
    }

    enrichPostComments(commentsTree, commentsInDOM) {

        // Here, we enrich the comments as follows:
        //  add the position of the comment in the DOM (according to the up votes)
        //  add the text and the down votes of the comment (also from the DOM)
        //  add the author and number of children as replies (from the comment tree)
        //  sort them based on the position in the DOM (according to the up votes)
        //  add the path of the comment (1.1, 1.2, 2.1 etc.) based on the position in the DOM
        //  add the score of the comment based on the position and down votes

        // Step 1: Flatten the comment tree to map with metadata, position and parent relationship
        //  This is a recursive function that traverses the comment tree and adds the metadata to the map
        let flatComments = new Map();

        let apiComments = 0;
        let skippedComments = 0;
        function flattenCommentTree(comment, parentId) {

            // Track the number of comments as we traverse the tree to find the comments from HN API.
            apiComments++;

            // If this is the story item (root of the tree), flatten its children, but do not add the story item to the map.
            //  We must call flattenCommentTree with the parent id as null so that the 'path' for the top level comments is correct.
            if (comment.type === 'story') {
                if (comment.children && comment.children.length > 0) {
                    comment.children.forEach(child => {
                        flattenCommentTree(child, null);
                    });
                }
                return;
            }

            // Set the values into the flat comments map - some properties come from the comment, some from the DOM comments map
            //  - id, author, replies: from the comment
            //  - position, text, down votes: from the DOM comments map
            //  - parentId from the caller of this method

            // Get the DOM comment corresponding to this comment from the commentsInDOM map
            const commentInDOM = commentsInDOM.get(comment.id);
            if(!commentInDOM) {
                // This comment is not found in the DOM comments because it was flagged or collapsed, skip it
                skippedComments++;
                return;
            }

            // Add comment to map along with its metadata including position, downvotes and parentId that are needed for scoring.
            flatComments.set(comment.id, {
                id: comment.id,  // Add the id in the comment object so that you can access later
                author: comment.author,
                replies: comment.children?.length || 0,
                position: commentInDOM.position,
                text: commentInDOM.text,
                downvotes: commentInDOM.downvotes,
                parentId: parentId,
            });

            // Process children of the current comment, pass the comment id as the parent id to the next iteration
            //  so that the parent-child relationship is retained, and we can use it to calculate the path later.
            if (comment.children && comment.children.length > 0) {
                comment.children.forEach(child => {
                    flattenCommentTree(child, comment.id);
                });
            }
        }

        // Flatten the comment tree and collect comments as a map
        flattenCommentTree(commentsTree, null);

        // Log the comments so far, skip the top level comment (story) because it is not added to the map
        this.logDebug(`...Comments from API:: Total: ${apiComments - 1}. Skipped: ${skippedComments}. Remaining: ${flatComments.size}`);

        // Step 2: Start building the map of enriched comments, start with the flat comments and sorting them by position.
        //  We have to do this BEFORE calculating the path because the path is based on the position of the comments.
        const enrichedComments = new Map([...flatComments.entries()]
            .sort((a, b) => a[1].position - b[1].position));

        // Step 3: Calculate paths (1.1, 2.3 etc.) using the parentId and the sequence of comments
        //  This step must be done AFTER sorting the comments by position because the path is based on the position of the comments.
        let topLevelCounter = 1;

        function calculatePath(comment) {
            let path;

            if (!comment.parentId) {
                // Top level comment - its parent is the story ('summarize all comments' flow) OR this is the root comment ('summarize thread' flow).
                //  The path is just a number like 1, 2, 3, etc.
                path = String(topLevelCounter++);
            } else {
                // Child comment at any level.
                //  The path is the parent's path + the position of the comment in the parent's children list.
                const parentPath = enrichedComments.get(comment.parentId).path;

                // get all the children of this comment's parents - this is the list of siblings
                const siblings = [...enrichedComments.values()]
                    .filter(c => c.parentId === comment.parentId);

                // Find the position of this comment in the siblings list - this is the sequence number in the path
                const positionInParent = siblings
                    .findIndex(c => c.id === comment.id) + 1;

                // Set the path as the parent's path + the position in the parent's children list
                path = `${parentPath}.${positionInParent}`;
            }
            return path;
        }

        // Step 4: Calculate the score for each comment based on its position and downvotes
        function calculateScore(comment, totalCommentCount) {
            // Example score calculation using downvotes
            const downvotes = comment.downvotes || 0;

            // Score is a number between 1000 and 0, and is calculated as follows:
            //   default_score = 1000 - (comment_position * 1000 / total_comment_count)
            //   penalty for down votes = default_score * # of downvotes

            const MAX_SCORE = 1000;
            const MAX_DOWNVOTES = 10;

            const defaultScore = Math.floor(MAX_SCORE - (comment.position * MAX_SCORE / totalCommentCount));
            const penaltyPerDownvote = defaultScore / MAX_DOWNVOTES;
            const penalty = penaltyPerDownvote * downvotes;

            const score = Math.floor(Math.max(defaultScore - penalty, 0));
            return score;
        }

        // Final step: Add the path and score for each comment as calculated above
        enrichedComments.forEach(comment => {
            comment.path = calculatePath(comment);
            comment.score = calculateScore(comment, enrichedComments.size);
        });

        return enrichedComments;
    }

    openOptionsPage() {
        chrome.runtime.sendMessage({
            type: 'HN_SHOW_OPTIONS',
            data: {}
        }).catch(error => {
            console.error('Error sending message to show options:', error);
        });
    }

    showConfigureAIMessage() {
        const message = 'To use the summarization feature, you need to configure an AI provider. <br/><br/>' +
            'Please <a href="#" id="options-page-link">open the settings page</a> to select and configure your preferred AI provider ' +
            '(OpenAI, Anthropic, <a href="https://ollama.com/" target="_blank">Ollama</a>, <a href="https://openrouter.ai/" target="_blank">OpenRouter</a> ' +
            'or <a href="https://developer.chrome.com/docs/ai/built-in" target="_blank">Chrome Built-in AI</a>).';

        this.summaryPanel.updateContent({
            title: 'AI Provider Setup Required',
            text: message
        });

        // Add event listener after updating content
        const optionsLink = this.summaryPanel.panel.querySelector('#options-page-link');
        if (optionsLink) {
            optionsLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.openOptionsPage();
            });
        }
    }

    summarizeTextWithAI(formattedComment, commentPathToIdMap) {
        chrome.storage.sync.get('settings').then(data => {

            const providerSelection = data.settings?.providerSelection;
            // const providerSelection = 'none';
            const model = data.settings?.[providerSelection]?.model;

            if (!providerSelection) {
                console.log('AI provider not configured. Prompting user to complete setup.');
                this.showConfigureAIMessage();
                return;
            }

            this.logInfo(`Summarization - AI Provider: ${providerSelection}, Model: ${model || 'none'}`);
            // this.logDebug('1. Formatted comment:', formattedComment);

            // Remove unnecessary anchor tags from the text
            formattedComment = this.stripAnchors(formattedComment);

            switch (providerSelection) {

                case 'none':
                    // For debugging purpose, show the formatted comment or any text as summary in the panel
                    this.showSummaryInPanel(formattedComment, commentPathToIdMap, 0).catch(error => {
                        console.error('Error showing summary:', error);
                    });
                    break;
                case 'chrome-ai':
                    this.summarizeUsingChromeBuiltInAI(formattedComment, commentPathToIdMap);
                    break;
                case 'ollama':
                    this.summarizeUsingOllama(formattedComment, model, commentPathToIdMap);
                    break;
                default:
                    // Cloud LLM providers - use the common summarize method
                    const apiKey = data.settings?.[providerSelection]?.apiKey;
                    this.summarizeUsingCloudLLM(providerSelection, model, apiKey, formattedComment, commentPathToIdMap);

                /*case 'openai':
                    const apiKey = data.settings?.[providerSelection]?.apiKey;
                    // this.summarizeUsingOpenAI(formattedComment,  model, apiKey, commentPathToIdMap);
                    this.summarizeUsingOpenAI_new(formattedComment,  model, apiKey, commentPathToIdMap);
                    break;

                case 'openrouter':
                    const openrouterKey = data.settings?.[providerSelection]?.apiKey;
                    this.summarizeUsingOpenRouter(formattedComment, model, openrouterKey, commentPathToIdMap);
                    break;

                case 'anthropic':
                    const claudeApiKey = data.settings?.[providerSelection]?.apiKey;
                    this.summarizeUsingAnthropic(formattedComment, model, claudeApiKey, commentPathToIdMap);
                    break;

                case 'deepseek':
                    const deepSeekApiKey = data.settings?.[providerSelection]?.apiKey;
                    this.summarizeUsingDeepSeek(formattedComment, model, deepSeekApiKey, commentPathToIdMap);
                    break;
                 */
            }
        }).catch(error => {
            console.error('Error fetching settings:', error);
        });
    }

    summarizeUsingOpenRouter(text, model, apiKey, commentPathToIdMap) {
        // Validate required parameters
        if (!text || !model || !apiKey) {
            console.error('Missing required parameters for OpenAI summarization');
            this.summaryPanel.updateContent({
                title: 'Error',
                text: 'Missing API configuration'
            });
            return;
        }

        // Rate Limit for OpenRouter
        const tokenLimit = 60000;
        const tokenLimitText = this.splitInputTextAtTokenLimit(text, tokenLimit);

        // Set up the API request
        const endpoint = 'https://openrouter.ai/api/v1/chat/completions';

        // Create the system and user prompts for better summarization
        const systemPrompt = this.getSystemMessage();
        // this.logDebug('2. System prompt:', systemPrompt);

        const postTitle = this.getHNPostTitle()
        const userPrompt = this.getUserMessage(postTitle, tokenLimitText);
        // this.logDebug('3. User prompt:', userPrompt);

        // OpenRouter, just like OpenAI, takes system and user messages as an array with role (system / user) and content
        const messages = [{
            role: "system",
            content: systemPrompt
        }, {
            role: "user",
            content: userPrompt
        }];

        // Prepare the request payload
        const payload = {
            model: model,
            messages: messages
        };

        // Make the API request using background message
        this.sendBackgroundMessage('FETCH_API_REQUEST', {
            url: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://chromewebstore.google.com/detail/hacker-news-companion/khfcainelcaedmmhjicphbkpigklejgf', // Optional. Site URL for rankings on openrouter.ai.
                'X-Title': 'Hacker News Companion', // Optional. Site title for rankings on openrouter.ai.
            },
            body: JSON.stringify(payload)
        }).then(data => {
            // disable the warning unresolved variable in this specific instance
            // noinspection JSUnresolvedVariable
            const summary = data?.choices[0]?.message?.content;

            if (!summary) {
                throw new Error('No summary generated from API response');
            }
            // console.log('4. Summary:', summary);

            // Update the summary panel with the generated summary
            this.showSummaryInPanel(summary, commentPathToIdMap, data.duration).catch(error => {
                console.error('Error showing summary:', error);
            });

        }).catch(error => {
            console.error('Error in OpenRouter summarization:', error);

            // Update the summary panel with an error message
            // OpenRouter follows the same error message structure as OpenAI
            // https://openrouter.ai/docs/errors
            let errorMessage = `Error generating summary using OpenRouter model ${model}. `;
            if (error.message.includes('API key')) {
                errorMessage += 'Please check your API key configuration.';
            } else if (error.message.includes('429')) {
                errorMessage += 'Rate limit exceeded. Please try again later.';
            } else if (error.message.includes('current quota')) {
                errorMessage += 'API quota exceeded. Please try again later.';
            }
            else {
                errorMessage += error.message + ' Please try again later.';
            }

            this.summaryPanel.updateContent({
                title: 'Error',
                text: errorMessage
            });
        });
    }

    summarizeUsingCloudLLM(aiProvider, modelName, apiKey, text, commentPathToIdMap) {
        // Validate required parameters
        if (!text || !aiProvider || !modelName || !apiKey) {
            console.error('Missing required parameters for AI summarization');
            this.summaryPanel.updateContent({
                title: 'Error',
                text: 'Missing API configuration'
            });
            return;
        }

        // Rate Limit for OpenAI
        // gpt-4-turbo      - 30,000 TPM
        // gpt-3.5-turbo    - 16,000 TPM
        const tokenLimit = modelName === 'gpt-4' ? 25_000 : 15_000;
        const tokenLimitText = this.splitInputTextAtTokenLimit(text, tokenLimit);

        // Create the system and user prompts for better summarization
        const systemPrompt = this.getSystemMessage();
        // this.logDebug('2. System prompt:', systemPrompt);

        const postTitle = this.getHNPostTitle()
        const userPrompt = this.getUserMessage(postTitle, tokenLimitText);
        // this.logDebug('3. User prompt:', userPrompt);

        const llmInput = {
            aiProvider,
            modelName,
            apiKey,
            systemPrompt,
            userPrompt,
        };

        this.sendBackgroundMessage('HN_SUMMARIZE', llmInput).then(summary => {
            if (!summary) {
                throw new Error('No summary generated from API response');
            }
            // console.log('4. Summary:', summary);

            // Update the summary panel with the generated summary
            this.showSummaryInPanel(summary, commentPathToIdMap, data.duration).catch(error => {
                console.error('Error showing summary:', error);
            });
        }).catch(error => {
            console.error('Error in AI summarization:', error);

            // Update the summary panel with an error message
            let errorMessage = `Error generating summary using model ${modelName}. `;
            if (error.message.includes('API key')) {
                errorMessage += 'Please check your API key configuration.';
            } else if (error.message.includes('429') ) {
                errorMessage += 'Rate limit exceeded. Please try again later.';
            } else if (error.message.includes('current quota')) {
                errorMessage += 'API quota exceeded. Please try again later.';
            } else {
                errorMessage += error.message + ' Please try again later.';
            }

            this.summaryPanel.updateContent({
                title: 'Error',
                text: errorMessage
            });
        });
    }

    summarizeUsingOpenAI(text, model, apiKey, commentPathToIdMap) {
        // Validate required parameters
        if (!text || !model || !apiKey) {
            console.error('Missing required parameters for OpenAI summarization');
            this.summaryPanel.updateContent({
                title: 'Error',
                text: 'Missing API configuration'
            });
            return;
        }

        // Rate Limit for OpenAI
        // gpt-4-turbo      - 30,000 TPM
        // gpt-3.5-turbo    - 16,000 TPM
        const tokenLimit = model === 'gpt-4-turbo' ? 25_000 : 15_000;
        const tokenLimitText = this.splitInputTextAtTokenLimit(text, tokenLimit);

        // Set up the API request
        const endpoint = 'https://api.openai.com/v1/chat/completions';

        // Create the system and user prompts for better summarization
        const systemPrompt = this.getSystemMessage();
        // this.logDebug('2. System prompt:', systemPrompt);

        const postTitle = this.getHNPostTitle()
        const userPrompt = this.getUserMessage(postTitle, tokenLimitText);
        // this.logDebug('3. User prompt:', userPrompt);

        // OpenAI takes system and user messages as an array with role (system / user) and content
        const messages = [{
            role: "system",
            content: systemPrompt
        }, {
            role: "user",
            content: userPrompt
        }];

        // Prepare the request payload
        const payload = {
            model: model,
            messages: messages,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0
        };

        // Make the API request using background message
        this.sendBackgroundMessage('FETCH_API_REQUEST', {
            url: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        }).then(data => {
            // disable thw warning unresolved variable in this specific instance
            // noinspection JSUnresolvedVariable
            const summary = data?.choices[0]?.message?.content;

            if (!summary) {
                throw new Error('No summary generated from API response');
            }
            // console.log('4. Summary:', summary);

            // Update the summary panel with the generated summary
            this.showSummaryInPanel(summary, commentPathToIdMap, data.duration).catch(error => {
                console.error('Error showing summary:', error);
            });

        }).catch(error => {
            console.error('Error in OpenAI summarization:', error);

            // Update the summary panel with an error message
            let errorMessage = `Error generating summary using OpenAI model ${model}. `;
            if (error.message.includes('API key')) {
                errorMessage += 'Please check your API key configuration.';
            } else if (error.message.includes('429') ) {
                errorMessage += 'Rate limit exceeded. Please try again later.';
            } else if (error.message.includes('current quota')) {
                errorMessage += 'API quota exceeded. Please try again later.';  // OpenAI has a daily quota
            }
            else {
                errorMessage += error.message + ' Please try again later.';
            }

            this.summaryPanel.updateContent({
                title: 'Error',
                text: errorMessage
            });
        });
    }

    summarizeUsingAnthropic(text, model, apiKey, commentPathToIdMap) {
        // Validate required parameters
        if (!text || !model || !apiKey) {
            console.error('Missing required parameters for Anthropic summarization');
            this.summaryPanel.updateContent({
                title: 'Error',
                text: 'Missing API configuration'
            });
            return;
        }

        // Limit the input text to 40,000 tokens for Anthropic
        const tokenLimitText = this.splitInputTextAtTokenLimit(text, 40_000);

        // Set up the API request
        const endpoint = 'https://api.anthropic.com/v1/messages';

        // Create the system and user prompts for better summarization
        const systemPrompt = this.getSystemMessage();
        // console.log('2. System prompt:', systemPrompt);

        const postTitle = this.getHNPostTitle()
        const userPrompt = this.getUserMessage(postTitle, tokenLimitText);
        // console.log('3. User prompt:', userPrompt);

        // Anthropic takes system messages at the top level, whereas user messages as an array with role "user" and content.
        const messages = [{
            role: "user",
            content: userPrompt
        }];

        // Prepare the request payload
        const payload = {
            model: model,
            max_tokens: 1024,
            system: systemPrompt,
            messages: messages
        };

        // Make the API request using background message
        this.sendBackgroundMessage('FETCH_API_REQUEST', {
            url: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true' // this is required to resolve CORS issue
            },
            body: JSON.stringify(payload)
        }).then(data => {

            if(!data || !data.content || data.content.length === 0) {
                throw new Error(`Summary response data is empty. ${data}`);
            }
            const summary = data.content[0].text;

            if (!summary) {
                throw new Error('No summary generated from API response');
            }
            // console.log('4. Summary:', summary);

            // Update the summary panel with the generated summary
            this.showSummaryInPanel(summary, commentPathToIdMap, data.duration).catch(error => {
                console.error('Error showing summary:', error);
            });

        }).catch(error => {
            console.error('Error in Anthropic summarization:', error);

            // Update the summary panel with an error message
            let errorMessage = `Error generating summary using Anthropic model ${model}. `;
            if (error.message.includes('API key')) {
                errorMessage += 'Please check your API key configuration.';
            } else if (error.message.includes('429')) {
                errorMessage += 'Rate limit exceeded. Please try again later.';
            } else {
                errorMessage += 'Please try again later.';
            }

            this.summaryPanel.updateContent({
                title: 'Error',
                text: errorMessage
            });
        });
    }

    summarizeUsingDeepSeek(text, model, apiKey, commentPathToIdMap) {
        // Validate required parameters
        if (!text || !model || !apiKey) {
            console.error('Missing required parameters for DeepSeek summarization');
            this.summaryPanel.updateContent({
                title: 'Error',
                text: 'Missing API configuration'
            });
            return;
        }

        // Limit the input text to 40,000 tokens for DeepSeek
        const tokenLimitText = this.splitInputTextAtTokenLimit(text, 40_000);

        // Set up the API request
        const endpoint = 'https://api.deepseek.com/v1/chat/completions';

        // Create the system and user prompts for better summarization
        const systemPrompt = this.getSystemMessage();
        // this.logDebug('2. System prompt:', systemPrompt);

        const postTitle = this.getHNPostTitle()
        const userPrompt = this.getUserMessage(postTitle, tokenLimitText);
        // this.logDebug('3. User prompt:', userPrompt);

        // DeepSeek takes system and user messages in the same format as OpenAI - an array with role (system / user) and content
        const messages = [{
            role: "system",
            content: systemPrompt
        }, {
            role: "user",
            content: userPrompt
        }];

        // Prepare the request payload
        const payload = {
            model: model,
            messages: messages,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0
        };

        // Make the API request using background message
        this.sendBackgroundMessage('FETCH_API_REQUEST', {
            url: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        }).then(data => {
            // disable thw warning unresolved variable in this specific instance
            // noinspection JSUnresolvedVariable
            const summary = data?.choices[0]?.message?.content;

            if (!summary) {
                throw new Error('No summary generated from API response');
            }
            // console.log('4. Summary:', summary);

            // Update the summary panel with the generated summary
            this.showSummaryInPanel(summary, commentPathToIdMap, data.duration).catch(error => {
                console.error('Error showing summary:', error);
            });

        }).catch(error => {
            console.error('Error in DeepSeek summarization:', error);

            // Update the summary panel with an error message
            let errorMessage = `Error generating summary using DeepSeek model ${model}. `;
            if (error.message.includes('API key')) {
                errorMessage += 'Please check your API key configuration.';
            } else if (error.message.includes('429') ) {
                errorMessage += 'Rate limit exceeded. Please try again later.';
            } else if (error.message.includes('current quota')) {
                errorMessage += 'API quota exceeded. Please try again later.';  // DeepSeek has a daily quota
            }
            else {
                errorMessage += error.message + ' Please try again later.';
            }

            this.summaryPanel.updateContent({
                title: 'Error',
                text: errorMessage
            });
        });
    }

    getSystemMessage() {
        return `
You are an AI assistant specialized in analyzing and summarizing Hacker News discussions. 
Your goal is to help users quickly understand the key discussions and insights from Hacker News threads without having to read through lengthy comment sections. 
A discussion consists of threaded comments where each comment can have child comments (replies) nested underneath it, forming interconnected conversation branches. 
Your task is to provide concise, meaningful summaries that capture the essence of the discussion while prioritizing high quality content. 
Follow these guidelines:

1. Discussion Structure Understanding:
   Comments are formatted as: [hierarchy_path] (score: X) <replies: Y> {downvotes: Z} Author: Comment
   
   - hierarchy_path: Shows the comment's position in the discussion tree
     - Single number [1] indicates a top-level comment
     - Each additional number represents one level deeper in the reply chain. e.g., [1.2.1] is a reply to [1.2]
     - The full path preserves context of how comments relate to each other

   - score: A normalized value between 1000 and 1, representing the comment's relative importance
     - 1000 represents the highest-value comment in the discussion
     - Other scores are proportionally scaled against this maximum
     - Higher scores indicate more upvotes from the community and content quality
     
   - replies: Number of direct responses to this comment

   - downvotes: Number of downvotes the comment received
     - Exclude comments with high downvotes from the summary
     - DO NOT include comments that are have 4 or more downvotes
   
   Example discussion:
   [1] (score: 1000) <replies: 3> {downvotes: 0} user1: Main point as the first reply to the post
   [1.1] (score: 800) <replies: 1> {downvotes: 0} user2: Supporting argument or counter point in response to [1]
   [1.1.1] (score: 150) <replies: 0> {downvotes: 6} user3: Additional detail as response to [1.1], but should be excluded due to more than 4 downvotes
   [2] (score: 400) <replies: 1> {downvotes: 0} user4: Comment with a theme different from [1]
   [2.1] (score: 250) <replies: 0> {downvotes: 1} user2: Counter point to [2], by previous user2, but should have lower priority due to low score and 1 downvote
   [3] (score: 200) <replies: 0> {downvotes: 0} user5: Another top-level comment with a different perspective

2. Content Prioritization:
   - Focus on high-scoring comments as they represent valuable community insights
   - Pay attention to comments with many replies as they sparked discussion
   - Track how discussions evolve through the hierarchy
   - Consider the combination of score, downvotes AND replies to gauge overall importance, prioritizing insightful, well-reasoned, and informative content
  
3. Theme Identification:
   - Use top-level comments ([1], [2], etc.) to identify main discussion themes
   - Identify recurring themes across top-level comments 
   - Look for comments that address similar aspects of the main post or propose related ideas.
   - Group related top-level comments into thematic clusters
   - Track how each theme develops through reply chains

4. Quality Assessment:
    - Prioritize comments that exhibit a combination of high score, low downvotes, substantial replies, and depth of content
    - High scores indicate community agreement, downvotes indicate comments not aligned with Hacker News guidelines or community standards
    - Replies suggest engagement and discussion, and depth (often implied by longer or more detailed comments) can signal valuable insights or expertise
    - Actively identify and highlight expert explanations or in-depth analyses. These are often found in detailed responses, comments with high scores, or from users who demonstrate expertise on the topic

Based on the above instructions, you should summarize the discussion. Your output should be well-structured, informative, and easily digestible for someone who hasn't read the original thread. 

Your response should be formatted using markdown and should have the following structure. 

# Overview
Brief summary of the overall discussion in 2-3 sentences - adjust based on complexity and depth of comments.

# Main Themes & Key Insights
[Bulleted list of themes, ordered by community engagement (combination of scores and replies). Order themes based on the overall community engagement they generated. Each bullet should be a summary with 2 or 3 sentences, adjusted based on the complexity of the topic.]

# [Theme 1 title - from the first bullet above]
[Summarize key insights or arguments under this theme in a couple of sentences. Use bullet points.]
[Identify important quotes and include them here with hierarchy_paths so that we can link back to the comment in the main page. Include direct "quotations" (with author attribution) where appropriate. You MUST quote directly from users with double quotes. You MUST include hierarchy_path as well. Do NOT include comments with 4 or more downvotes. For example: 
- [1.1.1] (user3) noted, '...'
- [2.1] (user2) explained that '...'"
- [3] Perspective from (user5) added, "..."
- etc.

# [Theme 2 title - from the second bullet in the main themes section]
[Same structure as above.]

# [Theme 3 title and 4 title - if the discussion has more themes]

# Key Perspectives
[Present contrasting perspectives, noting their community reception. When including key quotes, you MUST include hierarchy_paths and author, so that we can link back to the comment in the main page.]
[Present these concisely and highlight any significant community reactions (agreement, disagreement, etc.)]
[Watch for community consensus or disagreements]

# Notable Side Discussions
[Interesting tangents that added value. When including key quotes, you MUST include hierarchy_paths and author, so that we can link back to the comment in the main page]
`;
    }

    stripAnchors(text) {
        // Use a regular expression to match <a> tags and their contents
        const anchorRegex = /<a\b[^>]*>.*?<\/a>/g;

        // Replace all matches with an empty string
        return text.replace(anchorRegex, '');
    }

    splitInputTextAtTokenLimit(text, tokenLimit) {
        // Approximate token count per character
        const TOKENS_PER_CHAR = 0.25;

        // If the text is short enough, return it as is
        if (text.length * TOKENS_PER_CHAR < tokenLimit) {
            return text;
        }

        // Split the text into lines
        const lines = text.split('\n');
        let outputText = '';
        let currentTokenCount = 0;

        // Iterate through each line and accumulate until the token limit is reached
        for (const line of lines) {
            const lineTokenCount = line.length * TOKENS_PER_CHAR;
            if (currentTokenCount + lineTokenCount >= tokenLimit) {
                break;
            }
            outputText += line + '\n';
            currentTokenCount += lineTokenCount;
        }

        return outputText;
    }

    getUserMessage(title, text) {
        return `Provide a concise and insightful summary of the following Hacker News discussion, as per the guidelines you've been given. 
The goal is to help someone quickly grasp the main discussion points and key perspectives without reading all comments.
Please focus on extracting the main themes, significant viewpoints, and high-quality contributions.
The post title and comments are separated by three dashed lines:
---
Post Title:
${title}
---
Comments:
${text}
---`;

    }

    // Show the summary in the summary panel - format the summary for two steps:
    // 1. Replace markdown with HTML
    // 2. Replace path identifiers with comment IDs
    async showSummaryInPanel(summary, commentPathToIdMap, duration) {

        // Format the summary to replace markdown with HTML
        const summaryHtml = this.convertMarkdownToHTML(summary);

        // Parse the summaryHTML to find 'path' identifiers and replace them with the actual comment IDs links
        const formattedSummary = this.replacePathsWithCommentLinks(summaryHtml, commentPathToIdMap);

        const {aiProvider, model} = await this.getAIProviderModel();
        if (aiProvider) {
            this.summaryPanel.updateContent({
                metadata: `Summarized using <strong>${aiProvider} ${model || ''}</strong> in <strong>${duration ?? '0'} secs</strong>`,
                text: formattedSummary
            });
        } else {
            this.summaryPanel.updateContent({
                text: formattedSummary
            });
        }

        // Now that the summary links are in the DOM< attach listeners to those hyperlinks to navigate to the respective comments
        document.querySelectorAll('[data-comment-link="true"]').forEach(link => {

            link.addEventListener('click', (e) => {
                e.preventDefault();
                const id = link.dataset.commentId;
                const comment = document.getElementById(id);
                if(comment) {
                    this.setCurrentComment(comment);
                } else {
                    console.error('Failed to find DOM element for comment id:', id);
                }
            });
        });
    }

    replacePathsWithCommentLinks(text, commentPathToIdMap) {
        // Regular expression to match bracketed numbers with dots
        // Matches patterns like [1], [1.1], [1.1.2], etc.
        const pathRegex = /\[(\d+(?:\.\d+)*)]/g;

        // Replace each match with an HTML link
        return text.replace(pathRegex, (match, path) => {
            const id = commentPathToIdMap.get(path);
            if (!id) {
                return match; // If no ID found, return original text
            }
            return ` <a href="#" 
                       title="Go to comment #${id}"
                       data-comment-link="true" data-comment-id="${id}" 
                       style="color: rgb(130, 130, 130); text-decoration: underline;"
                    >comment #${id}</a>`;
        });
    }

    summarizeUsingOllama(text, model, commentPathToIdMap) {
        // Validate required parameters
        if (!text || !model) {
            console.error('Missing required parameters for Ollama summarization');
            this.summaryPanel.updateContent({
                title: 'Error',
                text: 'Missing API configuration'
            });
            return;
        }

        // Set up the API request
        const endpoint = 'http://localhost:11434/api/generate';

        // Create the system message for better summarization
        const systemMessage = this.getSystemMessage();

        // Create the user message with the text to summarize
        const title = this.getHNPostTitle();
        const userMessage = this.getUserMessage(title, text);

        // this.logDebug('2. System message:', systemMessage);
        // this.logDebug('3. User message:', userMessage);

        // Prepare the request payload
        const payload = {
            model: model,
            system: systemMessage,
            prompt: userMessage,
            stream: false
        };

        // Make the API request using background message
        this.sendBackgroundMessage('FETCH_API_REQUEST', {
            url: endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            timeout: 180_000 // Longer timeout for summarization
        })
            .then(data => {
                const summary = data.response;
                if (!summary) {
                    throw new Error('No summary generated from API response');
                }
                // this.logDebug('4. Summary:', summary);

                // Update the summary panel with the generated summary
                this.showSummaryInPanel(summary, commentPathToIdMap, data.duration).catch(error => {
                    console.error('Error showing summary:', error);
                });

            }).catch(error => {
            console.error('Error in Ollama summarization:', error);

            // Update the summary panel with an error message
            let errorMessage = 'Error generating summary. ' + error.message;
            this.summaryPanel.updateContent({
                title: 'Error',
                text: errorMessage
            });
        });
    }

    summarizeUsingChromeBuiltInAI(formattedComment, commentPathToIdMap) {
        if(this.isChomeAiAvailable === HNEnhancer.CHROME_AI_AVAILABLE.NO) {
            this.summaryPanel.updateContent({
                title: 'AI Not Available',
                metadata: 'Chrome Built-in AI is disabled or unavailable',
                text: `Unable to generate summary: Chrome's AI features are not enabled on your device. 
                       <br><br>
                       To enable and test Chrome AI:
                       <br>
                       1. Visit the <a class="underline" href="https://chrome.dev/web-ai-demos/summarization-api-playground/" target="_blank">Chrome AI Playground</a>
                       <br>
                       2. Try running a test summarization
                       <br>
                       3. If issues persist, check your Chrome settings and ensure you're using a compatible version`
            });
            return;
        }

        if(this.isChomeAiAvailable === HNEnhancer.CHROME_AI_AVAILABLE.AFTER_DOWNLOAD) {
            this.summaryPanel.updateContent({
                metadata: 'Downloading model for Chrome Built-in AI',
                text: `Chrome built-in AI model will be available after download. This may take a few moments.`
            });
        }

        // Summarize the text by passing in the text to page script which in turn will call the Chrome AI API
        window.postMessage({
            type: 'HN_AI_SUMMARIZE',
            data: {text: formattedComment, commentPathToIdMap: commentPathToIdMap}
        });
    }

    getHNPostTitle() {
        return document.title;
    }
}

// Initialize the HNEnhancer. Note that we are loading this content script with the default run_at of 'document_idle'.
// So this script is injected only after the DOM is loaded and all other scripts have finished executing.
// This guarantees that the DOM of the main HN page is loaded by the time this script runs.
document.hnEnhancer = new HNEnhancer();
