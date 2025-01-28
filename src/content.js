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
        return pathname === '/' || pathname === '/news' || pathname === '/newest' || pathname === '/ask' || pathname === '/show' || pathname === '/front';
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

        try {
            response = await chrome.runtime.sendMessage({type, data});

            const endTime = performance.now();
            this.logDebug(`Background message ${type} returned success in ${(endTime - startTime).toFixed(0)} ms. URL: ${data.url}`);

        } catch (error) {
            const endTime = performance.now();
            this.logDebug(`Background message ${type} returned error in ${(endTime - startTime).toFixed(0)} ms. URL: ${data.url}`);

            console.error(`Error sending browser runtime message ${type}:`, error);
            throw error;
        }

        this.logDebug(`Response from background message ${type}:`, JSON.stringify(response));

        if (!response) {
            console.error(`No response from background message ${type}`);
            throw new Error(`No response from background message ${type}`);
        }
        if (!response.success) {
            console.error(`Error response from background message ${type}:`, response.error);
            throw new Error(response.error);
        }

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
            const pageShortcuts = this.isHomePage ? homePageKeyboardShortcuts :
                this.isCommentsPage ? {
                        ...commentsPageKeyboardShortcuts,
                        ...(doubleKeyShortcuts['comments'] || {})
                    } :
                    {};

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
        document.head
