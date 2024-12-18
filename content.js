class HNEnhancer {

    static AI_AVAILABLE = {
        YES: 'readily',
        NO: 'no',
        AFTER_DOWNLOAD: 'after-download'
    }

    constructor() {
        this.authorComments = new Map();    // Store comment elements by author
        this.popup = this.createPopup();
        this.postAuthor = this.getPostAuthor();
        this.activeHighlight = null;        // Track currently highlighted element
        this.highlightTimeout = null;       // Track highlight timeout
        this.currentComment = null;         // Track currently focused comment
        this.helpModal = this.createHelpModal();
        this.summaryPanel = this.createSummaryPanel(); // Initialize the summary panel
        this.isAiAvailable = HNEnhancer.AI_AVAILABLE.NO;

        this.createHelpIcon();

        // Initialize home page navigation if on the home page
        if (this.isHomePage) {
            this.initHomePageNavigation();
        }
        else {
            // Once the summary panel is loaded, init the comment navigation, which updates the panel with the first comment
            this.updateCommentCounts();
            this.setupHoverEvents();
            this.initCommentNavigation(); // Initialize comment navigation
        }

        // Origin -> news.ycombinator.com; Registration for Summarization API
        const otMeta = document.createElement('meta');
        otMeta.httpEquiv = 'origin-trial';
        otMeta.content = 'Ah+d1HFcvvHgG3aB5OfzNzifUv02EpQfyQBlED1zXGCt8oA+XStg86q5zAwr7Y/UFDCmJEnPi019IoJIoeTPugsAAABgeyJvcmlnaW4iOiJodHRwczovL25ld3MueWNvbWJpbmF0b3IuY29tOjQ0MyIsImZlYXR1cmUiOiJBSVN1bW1hcml6YXRpb25BUEkiLCJleHBpcnkiOjE3NTMxNDI0MDB9';
        document.head.prepend(otMeta);

        this.initSummarizationAI();
        this.addSummarizeCommentsLink(); // Add the 'summarize comments' link
    }

    get isHomePage() {
        return window.location.pathname === '/' || window.location.pathname === '/news';
    }

    toggleHelpModal(show) {
        this.helpModal.style.display = show ? 'flex' : 'none';
    }

    createPopup() {
        const popup = document.createElement('div');
        popup.className = 'author-popup';
        document.body.appendChild(popup);
        return popup;
    }

    getPostAuthor() {
        const postAuthorElement = document.querySelector('.fatitem .hnuser');
        return postAuthorElement ? postAuthorElement.textContent : null;
    }

    async fetchUserInfo(username) {
        try {
            const response = await fetch(`https://hn.algolia.com/api/v1/users/${username}`, {cache: 'force-cache'});
            const userInfoResponse = await response.json();
            return {
                karma: userInfoResponse.karma || 'Not found', about: userInfoResponse.about || 'No about information'
            };
        } catch (error) {
            console.error('Error fetching user info:', error);
            return null;
        }
    }

    async getHNThread(itemId) {
        try {
            const response = await fetch(`https://hn.algolia.com/api/v1/items/${itemId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
            }
            const jsonData = await response.json();
            return this.convertToPathFormat(jsonData);
        } catch (error) {
            throw new Error(`Error fetching HN thread: ${error.message}`);
        }
    }

    convertToPathFormat(thread) {
        const result = [];

        function decodeHTMLEntities(text) {
            const textarea = document.createElement('textarea');
            textarea.innerHTML = text;
            return textarea.value;
        }

        function processNode(node, parentPath = "") {
            const currentPath = parentPath ? parentPath : "1";

            let content = "";

            if (node) {
                content = node.title || node.text || "";
                if (content === null || content === undefined) {
                    content = "";
                } else {
                    content = decodeHTMLEntities(content);
                }
            }

            result.push(`[${currentPath}] ${node ? node.author : "unknown"}: ${content}`);

            if (node && node.children && node.children.length > 0) {
                node.children.forEach((child, index) => {
                    const childPath = `${currentPath}.${index + 1}`;
                    processNode(child, childPath);
                });
            }
        }

        processNode(thread);
        return result.join('\n');
    }

    clearHighlight() {
        if (this.activeHighlight) {
            this.activeHighlight.classList.remove('highlight-author');
            this.activeHighlight = null;
        }
        if (this.highlightTimeout) {
            clearTimeout(this.highlightTimeout);
            this.highlightTimeout = null;
        }
    }

    highlightAuthor(authorElement) {
        this.clearHighlight();

        // Add highlight class to trigger animation
        authorElement.classList.add('highlight-author');
        this.activeHighlight = authorElement;
    }

    initCommentNavigation() {
        if(!this.summaryPanel) {
            console.error(`content.js: initCommentNavigation(): Summary panel is not available, so cannot initialize comment navigation.`);
            return;
        }

        // Initialize the first comment as current
        const firstComment = document.querySelector('.athing.comtr');
        if (firstComment) {
            this.setCurrentComment(firstComment);
        }

        // Save the last key press time and last key in order to handle double key press (eg: 'gg')
        let lastKey = '';
        let lastKeyPressTime = 0;

        // Add keyboard event listener
        document.addEventListener('keydown', (e) => {
            // Handle key press only when it is not in an input field
            const isInputField = e.target.matches('input, textarea, [contenteditable="true"]');
            if (isInputField) {
                return;
            }

            const result = this.handleKeyboardEvent(e, lastKey, lastKeyPressTime);
            if(result) {
                lastKey = result.lastKey;
                lastKeyPressTime = result.lastKeyPressTime;
            }
        });

        this.setupGlobalKeyboardShortcuts();
    }

    handleKeyboardEvent(e, lastKey, lastKeyPressTime) {

        switch (e.key) {

            case 'j': // Next comment at same depth (same as 'next' hyperlink)
                e.preventDefault();

                // Find the 'next' hyperlink in the HN nav panel and navigate to it.
                const nextComment = this.getNavElementByName(this.currentComment, 'next');
                if (nextComment) {
                    this.setCurrentComment(nextComment);
                }
                break;

            case 'k': // Previous comment at same depth (same as 'prev' hyperlink)
                e.preventDefault();

                // Find the 'prev' hyperlink in the HN nav panel and navigate to it.
                const prevComment = this.getNavElementByName(this.currentComment, 'prev');
                if (prevComment) {
                    this.setCurrentComment(prevComment);
                }
                break;

            case 'l': // Next child
                if (e.ctrlKey || e.metaKey) return; // Allow default behavior if Ctrl or Command key is pressed
                e.preventDefault();
                this.navigateNextChild();
                break;

            case 'h': // Parent comment (same as 'parent' hyperlink)
                e.preventDefault();

                // Find the 'parent' hyperlink in the HN nav panel and navigate to it.
                const parentComment = this.getNavElementByName(this.currentComment, 'parent');
                if (parentComment) {
                    this.setCurrentComment(parentComment);
                }
                break;

            case 'r': // Root comment (same as 'root' hyperlink)
                e.preventDefault();

                // Find the 'root' hyperlink in the HN nav panel and navigate to it.
                const rootComment = this.getNavElementByName(this.currentComment, 'root');
                if (rootComment) {
                    this.setCurrentComment(rootComment);
                }
                break;

            case '[': {
                e.preventDefault();
                const authorElement = this.currentComment.querySelector('.hnuser');
                if (authorElement) {
                    const author = authorElement.textContent;
                    this.navigateAuthorComments(author, this.currentComment, 'prev');
                }
                break;
            }

            case ']': {
                e.preventDefault();
                const authorElement = this.currentComment.querySelector('.hnuser');
                if (authorElement) {
                    const author = authorElement.textContent;
                    this.navigateAuthorComments(author, this.currentComment, 'next');
                }
                break;
            }

            case 'z': // Scroll to current comment
                e.preventDefault();
                if (this.currentComment) {
                    this.currentComment.scrollIntoView({behavior: 'smooth', block: 'center'});
                }
                break;

            case ' ': // Collapse current comment
                e.preventDefault();
                if (this.currentComment) {
                    const toggleLink = this.currentComment.querySelector('.togg');
                    if (toggleLink) {
                        toggleLink.click();
                    }
                }
                break;

            case 'g': // Go to first comment (when pressed twice)
                e.preventDefault();

                const currentTime = Date.now();
                if (lastKey === 'g' && currentTime - lastKeyPressTime < 500) {
                    const firstComment = document.querySelector('.athing.comtr');
                    if (firstComment) {
                        this.setCurrentComment(firstComment);
                    }
                }

                // Update the last key and time so that we can handle the repeated press in the next iteration
                lastKey = 'g';
                lastKeyPressTime = currentTime;
                break;

            case 'o': // Open the original post in new window
                e.preventDefault();
                const postLink = document.querySelector('.titleline a');
                if (postLink) {
                    window.open(postLink.href, '_blank');
                }
                break;

            case 's': // Open the summary panel on the right
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    this.toggleSummaryPanel();
                }
                break;
        }
        return {lastKey: lastKey, lastKeyPressTime: lastKeyPressTime};
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

    setCurrentComment(comment) {
        if (!comment) {
            console.log('content.js: setCurrentComment(): comment is null, so cannot set the current comment.');
            return;
        }

        // Remove highlight from previous comment
        if (this.currentComment) {
            const prevIndicator = this.currentComment.querySelector('.current-comment-indicator');
            if (prevIndicator) {
                prevIndicator.remove();
            }
        }

        // Set and highlight new current comment
        this.currentComment = comment;

        // Highlight the author name
        const authorElement = comment.querySelector('.hnuser');
        if (authorElement) {
            this.highlightAuthor(authorElement);
        }

        // update the summary panel to show the summary of the current comment
        // console.log(`content.js: setCurrentComment(): Updating summary panel for comment with author: ${authorElement.textContent}`);
        this.updateSummaryPanel(comment);

        // Scroll into the comment view if needed
        comment.scrollIntoView({behavior: 'smooth', block: 'center'});
    }

    updateSummaryPanel(comment) {
        if (!comment) {
            console.log('content.js: updateSummaryPanel(): No comment provided to updateSummaryPanel, so not updating the summary panel.');
            return;
        }

        // Make sure that the panel to display the new content is available
        if (!this.summaryPanel.querySelector('.summary-panel-content')) {
            console.error(`content.js: updateSummaryPanel(): Element .summary-panel-content not found in the summary panel.`);
            return;
        }


        // Get comment metadata
        const author = comment.querySelector('.hnuser')?.textContent || 'Unknown';
        const timestamp = comment.querySelector('.age')?.textContent || '';
        const commentText = comment.querySelector('.comment')?.textContent || '';
        const points = comment.querySelector('.score')?.textContent || '0 points';

        const summary = this.summarizeText(commentText);

        // Create summary content
        const summaryContentElement = this.summaryPanel.querySelector('.summary-panel-content');
        summaryContentElement.innerHTML = `
            <div class="summary-author">@${author}</div>
            <div class="summary-metadata">
                ${points} • ${timestamp}
            </div>
            <div class="summary-text">
                ${summary}
            </div>
        `;
    }

    summarizeText(text) {
        text = text.trim(); // trim beginning and ending white spaces

        // Count sentences by splitting on periods followed by spaces or end of string.
        //  If less than 3 sentences, do NOT summarize the text using AI.
        const sentences = text.split(/[.!?]+(?:\s+|$)/);

        // Filter out empty strings that might result from the split
        const sentenceCount = sentences.filter(sentence => sentence.trim().length > 0).length;
        if (sentenceCount < 3) {
            return text + '<br /><em>(Not enough content to summarize)</em>';
        }

        if (this.isAiAvailable !== HNEnhancer.AI_AVAILABLE.YES) {
            return text;
        }
        this.summarizeTextWithAI(text);

        return 'Summarizing...';
    }

    updateSummaryText(text) {
        const summaryTextElement = this.summaryPanel.querySelector('.summary-text');
        summaryTextElement.innerHTML = this.convertMarkdownToHTML(text);
    }

    convertMarkdownToHTML(markdown) {
        const html = markdown
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
            .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
            .replace(/\*(.*)\*/gim, '<i>$1</i>')
            .replace(/!\[(.*?)\]\((.*?)\)/gim, "<img alt='$1' src='$2' />")
            .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2'>$1</a>")
            .replace(/\n$/gim, '<br />');
        return html.trim();
    }

    navigateNextChild() {
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

    createHelpModal() {
        const modal = document.createElement('div');
        modal.className = 'keyboard-help-modal';
        modal.style.display = 'none';

        const content = document.createElement('div');
        content.className = 'keyboard-help-content';

        const title = document.createElement('h2');
        title.textContent = 'Keyboard Shortcuts';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'help-close-btn';
        closeBtn.textContent = '×';
        closeBtn.onclick = () => this.toggleHelpModal(false);

        const shortcuts = [
            {key: 'j', description: 'Go to next comment at same level'},
            {key: 'k', description: 'Go to previous comment at same level'},
            {key: 'l', description: 'Go to next child comment'},
            {key: 'h', description: 'Go to parent comment'},
            {key: 'r', description: 'Go to root comment'},
            {key: '[', description: 'Go to previous comment by current comment author'},
            {key: ']', description: 'Go to next comment by current comment author'},
            {key: 'gg', description: 'Go to first comment'},
            {key: 'z', description: 'Scroll to current comment'},
            {key: 'Space', description: 'Collapse/expand current comment'},
            {key: 'o', description: 'Open original post in new window'},
            {key: 's', description: 'Open summary panel'},
            {key: '?|/', description: 'Toggle this help panel'}
        ];

        const table = document.createElement('table');
        shortcuts.forEach(({key, description}) => {
            const row = table.insertRow();

            const keyCell = row.insertCell();

            // Keys could be 'l', 'h' for single keys, 'gg' for repeated keys or '?|/' for multiple keys
            const keys = key.split('|');
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

            const descCell = row.insertCell();
            descCell.textContent = description;
        });

        content.appendChild(closeBtn);
        content.appendChild(title);
        content.appendChild(table);
        modal.appendChild(content);
        document.body.appendChild(modal);

        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.toggleHelpModal(false);
            }
        });

        return modal;
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

    updateCommentCounts() {
        this.authorComments.clear();

        // Get all comments
        const comments = document.querySelectorAll('.athing.comtr');

        // Count comments by author and the author comments elements by author
        comments.forEach(comment => {

            // save the author comments mapping (comments from each user in this post)
            const authorElement = comment.querySelector('.hnuser');
            if (authorElement) {
                const author = authorElement.textContent;

                if (!this.authorComments.has(author)) {
                    this.authorComments.set(author, []);
                }
                this.authorComments.get(author).push(comment);
            }
        });

        comments.forEach(comment => {
            this.injectAuthorCommentsNavigation(comment);

            this.overrideHNDefaultNavigation(comment);
        });
    }

    injectAuthorCommentsNavigation(comment) {
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
            navPrev.className = 'author-nav';
            navPrev.textContent = '↑';
            navPrev.title = 'Go to previous comment by this author';
            navPrev.onclick = (e) => {
                e.preventDefault();
                this.navigateAuthorComments(author, comment, 'prev');
            };
            container.appendChild(navPrev);

            const navNext = document.createElement('span');
            navNext.className = 'author-nav';
            navNext.textContent = '↓';
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
            // authorElement.appendChild(container);
        }
    }

    overrideHNDefaultNavigation(comment) {
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

        // Highlight the author name in the target comment
        const targetAuthorElement = targetComment.querySelector('.hnuser');
        if (targetAuthorElement) {
            this.highlightAuthor(targetAuthorElement);
        }
    }

    setupHoverEvents() {
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
        });
    }

    calculatePanelConstraints(maxAvailableWidth) {

        // Calculate the min and max width based on the max available width
        // - on small screens, the panel should take 85%-95% of the available width
        // - on medium screens, the panel should take 30%-50% of the available width
        // - on large screens, the panel should take 20%-35% of the available width
        if (maxAvailableWidth < 768) {
            return {
                minWidth: Math.min(200, maxAvailableWidth * 0.85),
                maxWidth: Math.min(300, maxAvailableWidth * 0.95)
            };
        }

        if (maxAvailableWidth < 1024) {
            return {
                minWidth: Math.min(350, maxAvailableWidth * 0.6),
                maxWidth: Math.min(500, maxAvailableWidth * 0.8)
            };
        }

        return {
            minWidth: Math.min(400, maxAvailableWidth * 0.3),
            maxWidth: Math.min(700, maxAvailableWidth * 0.4)
        };
    }

    createSummaryPanel() {
        // Create wrapper for main content, resizer and panel
        const mainWrapper = document.createElement('div');
        mainWrapper.className = 'main-content-wrapper';

        // Get the main HN content
        const mainHnTable = document.querySelector('center > table');
        if (!mainHnTable) return null;

        // Create main content container
        const hnContentContainer = document.createElement('div');
        hnContentContainer.className = 'hn-content-container';

        // Move the main HN content inside our container
        mainHnTable.parentNode.insertBefore(mainWrapper, mainHnTable); // center > main-content-wrapper
        hnContentContainer.appendChild(mainHnTable);    // hn-content-container > table
        mainWrapper.appendChild(hnContentContainer);    // main-content-wrapper > hn-content-container

        // Create the summary panel element
        const panel = document.createElement('div');
        panel.className = 'summary-panel';

        // Create header
        const header = document.createElement('div');
        header.className = 'summary-panel-header';

        const title = document.createElement('h3');
        title.className = 'summary-panel-title';
        title.textContent = 'Comment Summary';
        header.appendChild(title);

        // Create content container
        const content = document.createElement('div');
        content.className = 'summary-panel-content';
        content.innerHTML = `
            <div class="summary-author">Loading...</div>
            <div class="summary-metadata"></div>
            <div class="summary-text"></div>
        `;

        panel.appendChild(header);
        panel.appendChild(content);

        // Create a vertical element to resize the panel
        const resizer = document.createElement('div');
        resizer.className = 'panel-resizer';

        // Add resize functionality
        let isResizing = false;
        let startX;
        let startWidth;

        // define the constants that are required to compute the new width - constants are better than computing
        // it dynamically using getComputedStyle() for better performance.
        const resizerWidth = 8;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = panel.offsetWidth; // This will be the flex-basis value including the 16px padding on each side
            // Prevent text selection while resizing
            document.body.style.userSelect = 'none';

            // Prevent default dragging behavior
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            // Calculate the new width of summary panel based on the delta between start and current mouse position

            // Calculate the min and max width of the panel based on the max available width
            //   Note - Summary panel and HN table can shrink/grow as the panel resizer moves left/right
            const maxAvailableWidth = mainWrapper.offsetWidth - resizerWidth;
            const {minWidth, maxWidth} = this.calculatePanelConstraints(maxAvailableWidth);

            // console.log(`viewport width: ${window.innerWidth}, mainContentWrapper ow: ${mainWrapper.offsetWidth}, panel ow: ${panel.offsetWidth}`);
            console.log(`maxAvailableWidth: ${maxAvailableWidth}, minWidth: ${minWidth}, maxWidth: ${maxWidth}`);

            // panel is moving from right to left, so x is decreasing from start to current position
            const deltaX = startX - e.clientX ;
            const newPanelWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + deltaX));

            // Update panel width (when the flex-direction is row, flex-basis is the width)
            panel.style.flexBasis = `${newPanelWidth}px`;

            // console.log(`BEFORE: hnTable.width: ${hnTable.offsetWidth}, startWidth:${startWidth}, startX: ${startX}, e.clientX: ${e.clientX}, newWidth: ${newPanelWidth}`);

            // Calculate the new width of the main HN table based on the new panel width. This is in 85% by default.
            const hnTable = document.querySelector('#hnmain');

            const viewportWidth = window.innerWidth;
            const availableWidth = viewportWidth - newPanelWidth - resizerWidth; // 8px resizer width, 32px padding
            const movePercent = (viewportWidth - e.clientX) / availableWidth; // Adjust range

            // Scale from 85 to 99 more aggressively
            const tableWidthPercent = 85 + (14 * Math.min(1, movePercent * 1.5)); // Increase scaling factor
            const clampedTableWidthPercent = Math.min(99, Math.max(85, tableWidthPercent));
            hnTable.style.width = `${clampedTableWidthPercent}%`;

            // console.log(`AFTER: hnTable.width: ${hnTable.offsetWidth}, newWidth: ${newPanelWidth}, clampedTableWidth: ${clampedTableWidthPercent}`);
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.userSelect = '';
            }
        });

        window.addEventListener('resize', () => {
            // Adjust the panel width if it's available and visible
            if (this.summaryPanel && this.summaryPanel.style.display !== 'none') {
                const {minWidth, maxWidth} = this.calculatePanelConstraints();
                const currentWidth = panel.offsetWidth;

                if (currentWidth < minWidth) {
                    panel.style.flexBasis = `${minWidth}px`;
                } else if (currentWidth > maxWidth) {
                    panel.style.flexBasis = `${maxWidth}px`;
                }
            }
        });

        // Hide the resizer and add it to the main wrapper. We will show it when the panel is visible.
        resizer.style.display = 'none';
        mainWrapper.appendChild(resizer);   // main-content-wrapper > panel-resizer

        // Hide the panel and add to the main wrapper. We will show it when the user opens it with the shortcut key.
        panel.style.display = 'none';
        mainWrapper.appendChild(panel);     // main-content-wrapper > summary-panel

        return panel;
    }

    toggleSummaryPanel() {
        if(!this.summaryPanel) {
            console.error(`content.js: toggleSummaryPanel(): Summary panel is not available, so cannot toggle the summary panel.`);
            return;
        }

        const summaryPanel = this.summaryPanel;
        const resizer = document.querySelector('.panel-resizer');

        // if summary panel and resizer are hidden, show it. Otherwise, hide it.
        if (summaryPanel.style.display === 'none') {

            // Reset the width of the summary panel width based on the available size
            const mainWrapper = document.querySelector('.main-content-wrapper');
            const maxAvailableWidth = mainWrapper.offsetWidth - 8;  // 8px resizer width
            const {minWidth, maxWidth} = this.calculatePanelConstraints(maxAvailableWidth);
            console.log(`maxAvailableWidth: ${maxAvailableWidth}, minWidth: ${minWidth}, maxWidth: ${maxWidth}`);
            summaryPanel.style.flexBasis = `${minWidth}px`;

            summaryPanel.style.display = 'block';
            resizer.style.display = 'block';

            // remove the min-width of HN table so that the summary panel can take more space
            const hnTable = document.querySelector('#hnmain');
            hnTable.style.minWidth = '0';
        } else {
            summaryPanel.style.display = 'none';
            resizer.style.display = 'none';

            // restore the min-width and width of HN table so that the default behavior is restored
            const hnTable = document.querySelector('#hnmain');
            hnTable.style.removeProperty('min-width');
            hnTable.style.removeProperty('width');
        }
    }

    initSummarizationAI() {

        function parseAvailable(available) {
            switch (available) {
                case 'readily':
                    return HNEnhancer.AI_AVAILABLE.YES;
                case 'no':
                    return HNEnhancer.AI_AVAILABLE.NO;
                case 'after-download':
                    return HNEnhancer.AI_AVAILABLE.AFTER_DOWNLOAD;
            }
            return HNEnhancer.AI_AVAILABLE.NO;
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
        window.addEventListener('message', function (event) {
            // reject all messages from other domains
            if (event.origin !== window.location.origin) {
                return;
            }

            // console.log('content.js - Received message:', event.type, JSON.stringify(event.data));

            // Handle different message types
            switch (event.data.type) {
                case 'HN_CHECK_AI_AVAILABLE_RESPONSE':
                    const available = event.data.data.available;

                    // TODO: Find a better way to set the HNEnhancer instance
                    document.hnEnhancer.isAiAvailable = parseAvailable(available);
                    console.log('HN_CHECK_AI_AVAILABLE_RESPONSE', document.hnEnhancer.isAiAvailable);
                    break;
                case 'HN_CHECK_AI_READY':
                    break;
                case 'HN_AI_SUMMARIZE_RESPONSE':
                    const summary = event.data.data.summary;
                    document.hnEnhancer.updateSummaryText(summary);
                    break;
            }
        });
    }

    summarizeTextWithAI(text) {

        chrome.storage.sync.get('settings').then(data => {

            const providerSelection = data.settings?.providerSelection;
            const model = data.settings?.[providerSelection]?.model;
            console.log(`Summarizing text with AI: providerSelection: ${providerSelection} model: ${model}`);

            switch (providerSelection) {
                case 'chrome-ai':
                    window.postMessage({
                        type: 'HN_AI_SUMMARIZE',
                        data: {text}
                    });
                    break;

                case 'openai':
                    const apiKey = data.settings?.[providerSelection]?.apiKey;

                    this.summarizeUsingOpenAI(text, model, apiKey);
                    break;

                case 'ollama':
                    this.summarizeUsingOlama(text, model);
                    break;
            }
        }).catch(error => {
            console.error('Error fetching settings:', error);
        });
    }

    summarizeUsingOpenAI(text, model, apiKey) {
        // Validate required parameters
        if (!text || !model || !apiKey) {
            console.error('Missing required parameters for OpenAI summarization');
            this.updateSummaryText('Error: Missing API configuration');
            return;
        }

        // Set up the API request
        const endpoint = 'https://api.openai.com/v1/chat/completions';

        // Create the system message for better summarization
        const systemMessage = {
            role: "system",
            content: "You are a precise summarizer. Create concise, accurate summaries that capture the main points while preserving key details. Focus on clarity and brevity."
        };

        // Create the user message with the text to summarize
        const userMessage = {
            role: "user",
            content: `Please summarize the following text concisely: ${text}`
        };

        // Prepare the request payload
        const payload = {
            model: model,
            messages: [systemMessage, userMessage],
            temperature: 0.3, // Lower temperature for more focused output
            max_tokens: 150,  // Limit response length for concise summaries
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0
        };

        // Make the API request using Promise chains
        fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        }).then(response => {
            if (!response.ok) {
                return response.json().then(errorData => {
                    throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
                });
            }
            return response.json();
        }).then(data => {
            const summary = data.choices[0]?.message?.content;

            if (!summary) {
                throw new Error('No summary generated from API response');
            }

            // Update the summary panel with the generated summary
            this.updateSummaryText(summary);
        }).catch(error => {
            console.error('Error in OpenAI summarization:', error);

            // Update the summary panel with an error message
            let errorMessage = 'Error generating summary. ';
            if (error.message.includes('API key')) {
                errorMessage += 'Please check your API key configuration.';
            } else if (error.message.includes('429')) {
                errorMessage += 'Rate limit exceeded. Please try again later.';
            } else {
                errorMessage += 'Please try again later.';
            }

            this.updateSummaryText(errorMessage);
        });
    }

    summarizeUsingOlama(text, model) {
        // Validate required parameters
        if (!text || !model) {
            console.error('Missing required parameters for Ollama summarization');
            this.updateSummaryText('Error: Missing API configuration');
            return;
        }

        // Set up the API request
        const endpoint = 'http://localhost:11434/api/generate';

        // Create the system message for better summarization
        const systemMessage = "You are a precise summarizer. Create concise, accurate summaries that capture the main points while preserving key details. Focus on clarity and brevity.";

        // Create the user message with the text to summarize
        const userMessage = `Please summarize the following text concisely: ${text}`;

        // Prepare the request payload
        const payload = {
            model: model,
            system: systemMessage,
            prompt: userMessage,
            stream: false
        };

        // Make the API request using Promise chains
        fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        }).then(response => {
            if (!response.ok) {
                return response.json().then(errorData => {
                    throw new Error(`Ollama API error: ${errorData.error?.message || 'Unknown error'}`);
                });
            }
            return response.json();
        }).then(data => {
            const summary = data.response;

            if (!summary) {
                throw new Error('No summary generated from API response');
            }

            // Update the summary panel with the generated summary
            this.updateSummaryText(summary);
        }).catch(error => {
            console.error('Error in Ollama summarization:', error);

            // Update the summary panel with an error message
            let errorMessage = 'Error generating summary. ' + error.message;
            this.updateSummaryText(errorMessage);
        });
    }

    initHomePageNavigation() {
        const posts = document.querySelectorAll('.athing');
        if (posts.length === 0) return;

        let currentPostIndex = 0;
        this.setCurrentPost(posts[currentPostIndex]);

        document.addEventListener('keydown', (e) => {
            if (e.target.matches('input, textarea, [contenteditable="true"]')) return;

            switch (e.key) {
                case 'j':
                    e.preventDefault();
                    if (currentPostIndex < posts.length - 1) {
                        currentPostIndex++;
                        this.setCurrentPost(posts[currentPostIndex]);
                    }
                    break;
                case 'k':
                    e.preventDefault();
                    if (currentPostIndex > 0) {
                        currentPostIndex--;
                        this.setCurrentPost(posts[currentPostIndex]);
                    }
                    break;
                case 'o':
                    e.preventDefault();
                    const postLink = posts[currentPostIndex].querySelector('.titleline a');
                    if (postLink) {
                        window.open(postLink.href, '_blank');
                    }
                    break;
                case 'c':
                    e.preventDefault();
                    if(!posts[currentPostIndex])
                        return;

                    const subtext = posts[currentPostIndex].nextElementSibling;
                    if (subtext) {
                        const commentsLink = subtext.querySelector('a[href^="item?id="]');
                        if (commentsLink) {
                            window.location.href = commentsLink.href;
                        }
                    }

                    break;
            }
        });

        this.setupGlobalKeyboardShortcuts();
    }

    setCurrentPost(post) {
        document.querySelectorAll('.athing').forEach(p => p.classList.remove('highlight-post'));
        post.classList.add('highlight-post');
        post.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setupGlobalKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.matches('input, textarea, [contenteditable="true"]')) return;

            switch (e.key) {
                case '?':
                case '/':
                    e.preventDefault();
                    this.toggleHelpModal(this.helpModal.style.display === 'none');
                    break;
                case 'Escape':
                    if (this.helpModal.style.display === 'flex') {
                        e.preventDefault();
                        this.toggleHelpModal(false);
                    }
                    break;
            }
        });
    }

    addSummarizeCommentsLink() {
        const navLinks = document.querySelector('.subtext .subline');
        if (navLinks) {
            const summarizeLink = document.createElement('a');
            summarizeLink.href = '#';
            summarizeLink.textContent = 'summarize all comments';
            // summarizeLink.style.marginLeft = '10px';
            summarizeLink.addEventListener('click', async (e) => {
                e.preventDefault();
                const itemId = this.getCurrentHNItemId();
                if (itemId) {
                    const thread = await this.getHNThread(itemId);
                    if (this.summaryPanel.style.display === 'none') {
                        this.toggleSummaryPanel();
                    }
                    this.updateSummaryText('Summarizing all comments in this post...');
                    this.summarizeTextWithAI(thread);

                }
            });
            navLinks.appendChild(document.createTextNode(' | '));
            navLinks.appendChild(summarizeLink);
        }
    }

    getCurrentHNItemId() {
        const itemIdMatch = window.location.search.match(/id=(\d+)/);
        return itemIdMatch ? itemIdMatch[1] : null;
    }
}

// Initialize the HNEnhancer. Note that we are loading this content script with the default run_at of 'document_idle'.
// So this script is injected only after the DOM is loaded and all other scripts have finished executing.
// This guarantees that the DOM of the main HN page is loaded by the time this script runs.
document.hnEnhancer = new HNEnhancer();
console.log('HN Enhancer initialized and ready');
