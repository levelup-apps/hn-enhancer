// SummaryPanel - Pure UI Component
class SummaryPanel {
    constructor() {
        this.panel = this.createPanel();
        this.resizer = this.createResizer();

        this.isResizing = false;
        this.startX = 0;
        this.startWidth = 0;
        this.resizerWidth = 8;

        // set up resize handlers at the resizer and at the window level
        this.setupResizeHandlers();
        this.setupWindowResizeHandler();

        // Attach panel and resizer to mainWrapper
        this.mainWrapper = document.querySelector('.main-content-wrapper');

        this.mainWrapper.appendChild(this.resizer);
        this.mainWrapper.appendChild(this.panel);
    }

    get isVisible() {
        return this.panel && this.panel.style.display !== 'none';
    }

    createPanel() {

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

        const panel = document.createElement('div');
        panel.className = 'summary-panel';
        panel.style.display = 'none';

        const header = document.createElement('div');
        header.className = 'summary-panel-header';

        const title = document.createElement('h3');
        title.className = 'summary-panel-title';
        title.textContent = 'Summary';
        header.appendChild(title);

        const content = document.createElement('div');
        content.className = 'summary-panel-content';
        content.innerHTML = `
            <div class="summary-metadata"></div>
            <div class="summary-text">Select a thread to summarize. More details <a class="navs" href="https://github.com/levelup-apps/hn-enhancer" target="_blank">here</a>.</div>
        `;

        panel.appendChild(header);
        panel.appendChild(content);

        return panel;
    }

    createResizer() {
        const resizer = document.createElement('div');
        resizer.className = 'panel-resizer';
        resizer.style.display = 'none';
        return resizer;
    }

    setupResizeHandlers() {
        this.resizer.addEventListener('mousedown', (e) => {
            this.isResizing = true;
            this.startX = e.clientX;
            this.startWidth = this.panel.offsetWidth;
            document.body.style.userSelect = 'none';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isResizing) return;

            const maxAvailableWidth = this.mainWrapper.offsetWidth - this.resizerWidth;
            const {minWidth, maxWidth} = this.calculatePanelConstraints(maxAvailableWidth);

            const deltaX = this.startX - e.clientX;
            const newPanelWidth = Math.max(minWidth, Math.min(maxWidth, this.startWidth + deltaX));

            this.panel.style.flexBasis = `${newPanelWidth}px`;
            this.adjustMainContentWidth(newPanelWidth, e.clientX);
        });

        document.addEventListener('mouseup', () => {
            if (this.isResizing) {
                this.isResizing = false;
                document.body.style.userSelect = '';
            }
        });
    }

    setupWindowResizeHandler() {
        window.addEventListener('resize', () => {
            if (this.isVisible) {
                const maxAvailableWidth = this.mainWrapper.offsetWidth - this.resizerWidth;
                const {minWidth, maxWidth} = this.calculatePanelConstraints(maxAvailableWidth);
                const currentWidth = this.panel.offsetWidth;

                if (currentWidth < minWidth) {
                    this.panel.style.flexBasis = `${minWidth}px`;
                } else if (currentWidth > maxWidth) {
                    this.panel.style.flexBasis = `${maxWidth}px`;
                }
            }
        });
    }

    calculatePanelConstraints(maxAvailableWidth) {
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

    adjustMainContentWidth(panelWidth, clientX) {
        const hnTable = document.querySelector('#hnmain');
        const viewportWidth = window.innerWidth;
        const availableWidth = viewportWidth - panelWidth - this.resizerWidth;
        const movePercent = (viewportWidth - clientX) / availableWidth;

        const tableWidthPercent = 85 + (14 * Math.min(1, movePercent * 1.5));
        const clampedTableWidthPercent = Math.min(99, Math.max(85, tableWidthPercent));
        hnTable.style.width = `${clampedTableWidthPercent}%`;
    }

    toggle() {
        if (!this.panel) return;

        if (!this.isVisible) {
            const maxAvailableWidth = this.mainWrapper.offsetWidth - this.resizerWidth;
            const {minWidth} = this.calculatePanelConstraints(maxAvailableWidth);
            this.panel.style.flexBasis = `${minWidth}px`;

            this.panel.style.display = 'block';
            this.resizer.style.display = 'block';

            const hnTable = document.querySelector('#hnmain');
            hnTable.style.minWidth = '0';
        } else {
            this.panel.style.display = 'none';
            this.resizer.style.display = 'none';

            const hnTable = document.querySelector('#hnmain');
            hnTable.style.removeProperty('min-width');
            hnTable.style.removeProperty('width');
        }
    }

    updateContent({ title, metadata, text }) {
        if (!this.panel) return;

        if (!this.isVisible) {
            this.toggle();
        }

        const titleElement = this.panel.querySelector('.summary-panel-title');
        if (title && titleElement) titleElement.textContent = title;

        const metadataElement = this.panel.querySelector('.summary-metadata');
        if (metadata && metadataElement) metadataElement.innerHTML = metadata;

        const textElement = this.panel.querySelector('.summary-text');
        if (text && textElement) textElement.innerHTML = text;
    }
}

class HNEnhancer {

    static AI_AVAILABLE = {
        YES: 'readily',
        NO: 'no',
        AFTER_DOWNLOAD: 'after-download'
    }

    constructor() {

        this.authorComments = new Map();    // Store comment elements by author
        this.popup = this.createAuthorPopup();
        this.postAuthor = this.getPostAuthor();
        this.activeHighlight = null;        // Track currently highlighted element
        this.highlightTimeout = null;       // Track highlight timeout
        this.currentComment = null;         // Track currently focused comment

        this.helpModal = this.createHelpModal();

        this.createHelpIcon();

        // Initialize the page based on type - home page vs. comments page
        if (this.isHomePage) {
            this.initHomePageNavigation();
        } else if (this.isCommentsPage) {
            // Initialize state for comments experience - author comments, comment navigation and summary panel,
            this.updateAuthorComments();
            this.initCommentsNavigation();
            this.summaryPanel = new SummaryPanel();
        }

        // TODO: move this to a more discrete place
        // Origin -> news.ycombinator.com; Registration for Summarization API
        const otMeta = document.createElement('meta');
        otMeta.httpEquiv = 'origin-trial';
        otMeta.content = 'Ah+d1HFcvvHgG3aB5OfzNzifUv02EpQfyQBlED1zXGCt8oA+XStg86q5zAwr7Y/UFDCmJEnPi019IoJIoeTPugsAAABgeyJvcmlnaW4iOiJodHRwczovL25ld3MueWNvbWJpbmF0b3IuY29tOjQ0MyIsImZlYXR1cmUiOiJBSVN1bW1hcml6YXRpb25BUEkiLCJleHBpcnkiOjE3NTMxNDI0MDB9';
        document.head.prepend(otMeta);

        this.initSummarizationAI();

    }

    get isHomePage() {
        return window.location.pathname === '/' || window.location.pathname === '/news';
    }

    get isCommentsPage() {
        return window.location.pathname === '/item';
    }

    initCommentsNavigation() {
        this.setupKeyboardNavigation();  // Set up keyboard navigation
        this.addSummarizeCommentsLink(); // Add 'Summarize all comments' link to the main post
        this.setupUserHover();           // Set up hover events for author info
        this.navigateToFirstComment();   // Navigate to the first comment
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

    setupKeyboardNavigation() {

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
                this.navigateToChildComment();
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
                    this.navigateToFirstComment();
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
                    this.summaryPanel.toggle();
                }
                break;
        }
        return {lastKey: lastKey, lastKeyPressTime: lastKeyPressTime};
    }

    navigateToFirstComment() {
        const firstComment = document.querySelector('.athing.comtr');
        if (firstComment) {
            this.setCurrentComment(firstComment);
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

    setCurrentComment(comment) {
        if (!comment) return;

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

        // Scroll into the comment view if needed
        comment.scrollIntoView({behavior: 'smooth', block: 'center'});
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

    updateAuthorComments() {
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

            // Insert summarize comment link
            const navsElement = comment.querySelector('.navs');
            if(navsElement) {
                navsElement.appendChild(document.createTextNode(' | '));

                const summarizeChildCommentLink = document.createElement('a');
                summarizeChildCommentLink.href = '#';
                summarizeChildCommentLink.textContent = 'summarize thread';
                summarizeChildCommentLink.title = 'Summarize all child comments in this thread';

                summarizeChildCommentLink.addEventListener('click', async (e) => {
                    e.preventDefault();

                    // Clicking the link should set the current comment state
                    this.setCurrentComment(comment);

                    const itemLinkElement = comment.querySelector('.age')?.getElementsByTagName('a')[0];
                    if (itemLinkElement) {
                        const itemId = itemLinkElement.href.split('=')[1];
                        const {formattedComment, commentPathToIdMap} = await this.getHNThread(itemId);

                        const commentDepth = commentPathToIdMap.size;
                        const shouldSummarize = this.shouldSummarizeText(formattedComment, commentDepth);

                        if(!shouldSummarize) {
                            this.summaryPanel.updateContent({
                                title: 'Thread Too Brief for Summary',
                                metadata: `Thread: ${author} and child comments`,
                                text: `This conversation thread is concise enough to read directly. Summarizing short threads with a remote AI service would be inefficient. <br/><br/>
                                      However, if you still want to summarize it, you can <a href="#" id="options-page-link">configure a local AI provider</a> 
                                      like <a href="https://developer.chrome.com/docs/ai/built-in" target="_blank">Chrome Built-in AI</a> or 
                                      <a href="https://ollama.com/" target="_blank">Ollama</a> for more efficient processing of shorter threads.`
                            });

                            const optionsLink = this.summaryPanel.panel.querySelector('#options-page-link');
                            if (optionsLink) {
                                optionsLink.addEventListener('click', (e) => {
                                    e.preventDefault();
                                    this.openOptionsPage();
                                });
                            }
                            return;
                        }

                        if (formattedComment) {
                            const metadata = `Thread: ${author} and child comments`
                            this.summaryPanel.updateContent({
                                title: 'Thread Summary',
                                metadata: metadata,
                                text: 'Summarizing all child comments...'
                            });
                            this.summarizeTextWithAI(formattedComment, commentPathToIdMap);
                        }
                    }
                });

                navsElement.appendChild(summarizeChildCommentLink);
            }
        }
    }

    shouldSummarizeText(formattedText, commentDepth) {
        const max_sentences = 8;
        const maxDepth = 3;

        const sentences = formattedText.split(/[.!?]+(?:\s+|$)/)
            .filter(sentence => sentence.trim().length > 0);

        // console.log('sentences:', sentences.length, 'depth:', commentDepth, 'shouldSummarize result: ', sentences.length > max_sentences && commentDepth > maxDepth);
        // console.log(formattedText);
        return sentences.length > max_sentences && commentDepth > maxDepth;
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

    initSummarizationAI() {

        this.isAiAvailable = HNEnhancer.AI_AVAILABLE.NO;

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
                    document.hnEnhancer.summaryPanel.updateContent({
                        text: summary
                    });
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

            summarizeLink.addEventListener('click', (e) => this.handleSummarizeAllCommentsClick(e));

            navLinks.appendChild(document.createTextNode(' | '));
            navLinks.appendChild(summarizeLink);
        }
    }

    async handleSummarizeAllCommentsClick(e) {
        e.preventDefault();
        const itemId = this.getCurrentHNItemId();
        if (!itemId) {
            return;
        }
        try {
            if (!this.summaryPanel.isVisible) {
                this.summaryPanel.toggle();
            }
            const {formattedComment, commentPathToIdMap} = await this.getHNThread(itemId);

            this.summaryPanel.updateContent({
                title: 'Post Summary',
                metadata: 'All comments',
                text: 'Summarizing all comments in this post...'
            });

            this.summarizeTextWithAI(formattedComment, commentPathToIdMap);

        } catch (error) {
            console.error('Error fetching thread:', error);
            this.summaryPanel.updateContent({
                title: 'Error',
                metadata: '',
                text: 'Failed to fetch thread content'
            });
        }
    }

    getCurrentHNItemId() {
        const itemIdMatch = window.location.search.match(/id=(\d+)/);
        return itemIdMatch ? itemIdMatch[1] : null;
    }

    async getHNThread(itemId) {
        try {
            const response = await fetch(`https://hn.algolia.com/api/v1/items/${itemId}`);
            if (!response.ok) {
                // noinspection ExceptionCaughtLocallyJS
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
        const commentPathToIdMap = new Map();

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
                commentPathToIdMap.set(currentPath, node.id);
                result.push(`[${currentPath}] ${node ? node.author : "unknown"}: ${content}`);

                if (node.children && node.children.length > 0) {
                    node.children.forEach((child, index) => {
                        const childPath = `${currentPath}.${index + 1}`;
                        processNode(child, childPath);
                    });
                }
            }
        }

        processNode(thread);
        return {
            formattedComment: result.join('\n'),
            commentPathToIdMap: commentPathToIdMap
        };
    }

    openOptionsPage() {
        chrome.runtime.sendMessage({
            type: 'HN_SHOW_OPTIONS',
            data: {}
        });
    }
    summarizeTextWithAI(formattedComment, commentPathToIdMap) {
        chrome.storage.sync.get('settings').then(data => {

            const providerSelection = data.settings?.providerSelection;
            // const providerSelection = 'none';
            const model = data.settings?.[providerSelection]?.model;

            if (!providerSelection ) {
                console.log('Missing AI summarization configuration');

                const message = 'To use the summarization feature, you need to configure an AI provider. <br/><br/>' +
                    'Please <a href="#" id="options-page-link">open the settings page</a> to select and configure your preferred AI provider ' +
                    '(OpenAI, Anthropic, <a href="https://ollama.com/" target="_blank">Ollama</a> or <a href="https://developer.chrome.com/docs/ai/built-in" target="_blank">Chrome Built-in AI</a>).';

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
                return;
            }

            console.log(`Summarizing text with AI: providerSelection: ${providerSelection} model: ${model}`);

            switch (providerSelection) {
                case 'chrome-ai':
                    window.postMessage({
                        type: 'HN_AI_SUMMARIZE',
                        data: {text: formattedComment}
                    });
                    break;

                case 'openai':
                    const apiKey = data.settings?.[providerSelection]?.apiKey;
                    this.summarizeUsingOpenAI(formattedComment,  model, apiKey, commentPathToIdMap);
                    break;

                case 'anthropic':
                    const claudeApiKey = data.settings?.[providerSelection]?.apiKey;
                    this.summarizeUsingAnthropic(formattedComment, model, claudeApiKey, commentPathToIdMap);
                    break;

                case 'ollama':
                    this.summarizeUsingOllama(formattedComment, model, commentPathToIdMap);
                    break;

                case 'none':
                    this.showSummaryInPanel(formattedComment, commentPathToIdMap);
                    break;
            }
        }).catch(error => {
            console.error('Error fetching settings:', error);
        });
    }

    getSystemMessage() {
        return `
You are a skilled discussion analyzer specializing in hierarchical conversation in Hacker News comments. 
Your task is to create a comprehensive summary that captures both the content and the structural flow of the discussion.

Input Format:
The conversation will be provided as text with path-based identifiers showing the hierarchical structure:
[path_id] Author: Message

Example:
[1] Author: Initial message
[1.1] Author2: First-level reply
[1.1.1] Author3: Second-level reply

Follow these guidelines to generate the summary:
- Pay special attention to path numbers when tracking reply relationships
- Identify if certain branches were more productive than others
- Track how ideas evolve and transform across branch boundaries
- Map how topics evolve within each branch
- Identify topic relationships between branches
- Note where conversation shifts occur

Respond in this format:

Summary
- Major Discussion Points
- Key takeaways across all branches

Thread Analysis:
- Primary Branches: [Number and brief description of main conversation branches]
- Interaction Patterns: [Notable patterns in how the discussion branched]
- Branch Effectiveness: [Specify Branch path]

[Repeat for other significant branches]

`;
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

        // Set up the API request
        const endpoint = 'https://api.openai.com/v1/chat/completions';

        // Create the system message for better summarization
        const message = this.getSystemMessage();
        const systemMessage = {
            role: "system",
            content: message
        };

        // Create the user message with the text to summarize
        const postTitle = this.getHNPostTitle()
        const userMessage = {
            role: "user",
            content: `Please summarize the comments for a post with the title '${postTitle}'. \n Following are the formatted comments: \n ${text}`
        };

        // Prepare the request payload
        const payload = {
            model: model,
            messages: [systemMessage, userMessage],
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
            const summary = data?.choices[0]?.message?.content;

            if (!summary) {
                throw new Error('No summary generated from API response');
            }

            // Update the summary panel with the generated summary
            this.showSummaryInPanel(summary, commentPathToIdMap);

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

        // Set up the API request
        const endpoint = 'https://api.anthropic.com/v1/messages';

        // Create the user message for better summarization

        // Create the user message with the text to summarize
        const postTitle = this.getHNPostTitle()
        const systemMessage = `You are a skilled discussion analyzer specializing in hierarchical conversations from Hacker News comments. 
            Your task is to create a comprehensive summary that captures both the content and the structural flow of the discussion.
            Format your response in MARKDOWN format.`;

        const userMessage = {
            role: "user",
            content: this.getAnthropicUserMessage(postTitle, text)
        };

        // Prepare the request payload
        const payload = {
            model: model,
            max_tokens: 1024,
            system: systemMessage,
            messages: [userMessage]
        };

        // Make the API request using Promise chains
        fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true' // this is required to resolve CORS issue
            },
            body: JSON.stringify(payload)
        }).then(response => {
            if (!response.ok) {
                return response.json().then(errorData => {
                    throw new Error(`Anthropic API error: ${errorData.error?.message || 'Unknown error'}`);
                });
            }
            return response.json();
        }).then(data => {
            if(!data || !data.content || data.content.length === 0) {
                throw new Error(`Summary response data is empty. ${data}`);
            }
            const summary = data?.content[0]?.text;

            if (!summary) {
                throw new Error('No summary generated from API response');
            }

            // Update the summary panel with the generated summary
            this.showSummaryInPanel(summary, commentPathToIdMap);

        }).catch(error => {
            console.error('Error in Anthropic summarization:', error);

            // Update the summary panel with an error message
            let errorMessage = 'Error generating summary. ';
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

    getAnthropicUserMessage(title, text) {
        return `Please summarize the following text:
Here is the title of the Hacker News post you will be analyzing:
<post_title>
${title}
</post_title>

Below are the formatted comments for this post. Each comment is preceded by a path-based identifier showing its position in the hierarchical structure:
<comments>
${text}
</comments>

Instructions:
1. Carefully read through the post title and all comments.
2. Analyze the hierarchical structure of the conversation, paying close attention to the path numbers (e.g., [1], [1.1], [1.1.1]) to track reply relationships.
3. Identify the major discussion points across all branches of the conversation.
4. Track how topics evolve within each branch and across branch boundaries.
5. Identify topic relationships between different branches.
6. Note where significant conversation shifts occur.

Summary:
- Major Discussion Points: [List the main topics discussed across all branches]
- Key Takeaways: [Summarize the most important insights or conclusions from the entire discussion]

Thread Analysis:
- Primary Branches: [Number and brief description of main conversation branches]
- Interaction Patterns: [Notable patterns in how the discussion branched and evolved]
- Branch Effectiveness: [For each significant branch, specify the branch path and evaluate its productivity or engagement level]

Example output structure (do not copy the content, only the format):

Summary:

Major Discussion Points:
  1. [Topic 1]
  2. [Topic 2]
  3. [Topic 3]

Key Takeaways:
  1. [Takeaway 1]
  2. [Takeaway 2]

Thread Analysis:

Primary Branches: 
  1. [Branch 1 description]
  2. [Branch 2 description]

Interaction Patterns: 
[Description of how the conversation flowed and branched]

Branch Effectiveness:
  - [Branch 1 path]: [Evaluation]
  - [Branch 2 path]: [Evaluation]

<discussion_breakdown>
[Detailed breakdown as per the instructions above]
</discussion_breakdown>

Please proceed with your analysis and summary of the Hacker News discussion.`;
    }

    // Show the summary in the summary panel - format the summary for two steps:
    // 1. Replace markdown with HTML
    // 2. Replace path identifiers with comment IDs
    showSummaryInPanel(summary, commentPathToIdMap) {

        // Format the summary to replace markdown with HTML
        const summaryHtml = this.convertMarkdownToHTML(summary);

        // Parse the summaryHTML to find 'path' identifiers and replace them with the actual comment IDs links
        const formattedSummary = this.replacePathsWithCommentLinks(summaryHtml, commentPathToIdMap);

        this.summaryPanel.updateContent({
            text: formattedSummary
        });

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
        const pathRegex = /\[(\d+(?:\.\d+)*)\]/g;

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
            // TODO: Get the comment metadata here and pass it to the summary panel
            this.showSummaryInPanel(summary, commentPathToIdMap);

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

    getHNPostTitle() {
        if (!this.isCommentsPage) {
            return '';
        }
        return document.title;
    }

}

// Initialize the HNEnhancer. Note that we are loading this content script with the default run_at of 'document_idle'.
// So this script is injected only after the DOM is loaded and all other scripts have finished executing.
// This guarantees that the DOM of the main HN page is loaded by the time this script runs.
document.hnEnhancer = new HNEnhancer();
console.log('HN Enhancer initialized and ready');
