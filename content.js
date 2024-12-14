class HNEnhancer {
    static SummaryType = {
        INLINE: 'inline',
        SIDEPANEL: 'sidepanel'
    };

    constructor() {
        this.authorComments = new Map();    // Store comment elements by author
        this.popup = this.createPopup();
        this.postAuthor = this.getPostAuthor();
        this.activeHighlight = null;        // Track currently highlighted element
        this.highlightTimeout = null;       // Track highlight timeout
        this.currentComment = null;         // Track currently focused comment
        this.helpModal = this.createHelpModal();

        // Set the summary type - INLINE for the inline panel or 'SIDEPANEL for the Chrome side panel
        this.summaryType = HNEnhancer.SummaryType.INLINE;
        // this.summaryType = HNEnhancer.SummaryType.SIDEPANEL;

        // Create and show the panel at initial load
        this.summaryPanel = this.createSummaryPanel();

        // if the panel is visible, close it at initial load
        if(this.isPanelVisible) {
            this.toggleSummaryPanel();
        }
        this.isSidePanelLoaded = false;

        // Add the toggle button to switch between the panel type (inline or side panel)
        this.panelTypeToggle = this.createPanelTypeToggle();

        this.init();
    }

    init() {
        this.createHelpIcon();
        this.updateCommentCounts();
        this.setupHoverEvents();
        this.initCommentNavigation(); // Initialize comment navigation
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
            lastKey = result.lastKey;
            lastKeyPressTime = result.lastKeyPressTime;
        });
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

            case '?': // Toggle help modal
            case '/': // Toggle help modal
                e.preventDefault();
                this.toggleHelpModal(this.helpModal.style.display === 'none');
                break;

            case 'Escape': // Close help modal if open
                if (this.helpModal.style.display === 'flex') {
                    e.preventDefault();
                    this.toggleHelpModal(false);
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
        // Remove highlight from previous comment
        if (this.currentComment) {
            const prevIndicator = this.currentComment.querySelector('.current-comment-indicator');
            if (prevIndicator) {
                prevIndicator.remove();
            }
        }

        // Set and highlight new current comment
        this.currentComment = comment;
        if (comment) {
            // Highlight the author name
            const authorElement = comment.querySelector('.hnuser');
            if (authorElement) {
                this.highlightAuthor(authorElement);
            }

            // update the side panel to show the summary of the current comment
            console.log(`content.js: setCurrentComment(): Updating summary panel for comment with author: ${authorElement.textContent}`);
            this.updateSummaryPanel(comment);

            // Scroll into the comment view if needed
            comment.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
    }

    updateSummaryPanel(comment) {
        if (!comment) {
            console.log('content.js: updateSummaryPanel(): No comment provided to updateSummaryPanel, so not updating the side panel.');
            return;
        }

        // Make sure that the panel to display the new content is available - inline or side panel
        if(this.summaryType === HNEnhancer.SummaryType.INLINE) {
            if(!this.summaryPanel.querySelector('.summary-panel-content')) {
                console.error(`content.js: updateSummaryPanel(): Element .summary-panel-content not found in the summary panel.`);
                return;
            }
        } else {
            if (!this.isSidePanelLoaded) {
                console.log('content.js: updateSummaryPanel(): Side panel not loaded yet, so not updating the side panel.');
                return;
            }
        }

        // Get comment metadata
        const author = comment.querySelector('.hnuser')?.textContent || 'Unknown';
        const timestamp = comment.querySelector('.age')?.textContent || '';
        const commentText = comment.querySelector('.comment')?.textContent || '';
        const points = comment.querySelector('.score')?.textContent || '0 points';

        const summary = this.summarizeText(commentText);

        if(this.summaryType === HNEnhancer.SummaryType.INLINE) {
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

        } else {
            const messageName = 'update_side_panel';
            const messageData = {
                author,
                timestamp,
                points,
                summary
            };

            console.log(`content.js: Sending message ${messageName} for comment with data author: ${messageData.author}`);
            chrome.runtime.sendMessage(
                {type: messageName, data: messageData}
            ).then(response => {
                console.log(`content.js: Success sending message ${messageName}. Received response: ${JSON.stringify(response)}`);
            }).catch(error => {
                console.error(`content.js: Error sending message ${message}. Error: ${JSON.stringify(error)}`);
            });
        }
    }

    summarizeText(text) {
        // Basic text summarization (you can enhance this)
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        let summary;

        if (sentences.length <= 2) {
            summary = sentences.join('. ');
        } else {
            // Take first and last sentence for a basic summary
            // summary = sentences[0] + '.......... ' + sentences[sentences.length - 2];
            summary = text;
        }

        return summary.trim() + '.';
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

    createSummaryPanel() {
        return this.summaryType === HNEnhancer.SummaryType.INLINE ?
            this.initSummaryInline() :
            this.initSummarySidePanel();
    }

    initSummarySidePanel() {
        console.log('content.js: initSummarySidePanel(): Subscribing to chrome runtime messages');
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

            console.log('content.js: Message Listener: Received message: ', JSON.stringify(message));

            if (message.type === 'side_panel_loaded') {
                this.isSidePanelLoaded = true;
                this.updateSummaryPanel(this.currentComment);
                sendResponse({success: true});
            }
        });
        return null;
    }

    async toggleSidePanel() {

        try {
            // First send a message to check if the panel is open before trying to open or close it.
            let messageName = 'is_panel_open';
            console.log(`content.js: Sending message ${messageName}`);

            const isOpenResponse = await chrome.runtime.sendMessage({type: messageName, data: {}});
            console.log(`content.js: Success sending message ${messageName}. Received response: ${JSON.stringify(isOpenResponse)}`);

            // Check the response to determine the next message to send - close the panel if it is open, otherwise open it.
            messageName = (isOpenResponse && isOpenResponse.data.isOpen) ? 'close_side_panel' : 'open_side_panel';

            // Now send the open/close message to the side panel
            console.log(`content.js: Sending message ${messageName}`);
            const response = await chrome.runtime.sendMessage({type: messageName, data: {}});
            console.log(`content.js: Success sending message ${messageName}. Received response: ${JSON.stringify(response)}`);

        } catch (error) {
            console.error(`content.js: Error sending message. Error: ${JSON.stringify(error)}`);
        }
    }

    initSummaryInline() {
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

        // Create resizer button
        const resizer = document.createElement('button');
        resizer.className = 'panel-resizer';

        // Add resize functionality
        let isResizing = false;
        let startX;
        let startWidth;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = panel.offsetWidth;

            document.body.style.userSelect = 'none'; // Prevent text selection while resizing
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            // Find the new width based on the delta between start and current mouse position
            const deltaX =  e.clientX - startX;
            const newWidth = Math.max(400, Math.min(672, startWidth - deltaX));

            // Update panel width (when the flex-direction is row, flex-basis is the width)
            panel.style.flexBasis = `${newWidth}px`;

        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.userSelect = '';
            }
        });

        // Add resizer and panel to the main wrapper
        mainWrapper.appendChild(resizer);   // main-content-wrapper > panel-resizer
        mainWrapper.appendChild(panel);     // main-content-wrapper > summary-panel

        // Panel is visible now, set it to true before returning
        this.isPanelVisible = true;

        return panel;
    }

    toggleSummaryPanel() {
        if (this.summaryType === HNEnhancer.SummaryType.INLINE) {
            const summaryPanel = this.summaryPanel;
            const resizer = document.querySelector('.panel-resizer');

            if (this.isPanelVisible) {
                summaryPanel.style.display = 'none';
                resizer.style.display = 'none';
            } else {
                summaryPanel.style.display = 'block';
                resizer.style.display = 'block';
            }

            // flip the panel visible flag
            this.isPanelVisible = !this.isPanelVisible;
        } else {
            this.toggleSidePanel();
        }
    }

    createPanelTypeToggle() {
        const toggle = document.createElement('div');
        toggle.className = 'panel-type-toggle';

        // Create labels and switch
        const inlineLabel = document.createElement('span');
        inlineLabel.className = 'panel-type-label' + (this.summaryType !== HNEnhancer.SummaryType.SIDEPANEL ? ' active' : '');
        inlineLabel.textContent = 'Inline';

        const switchLabel = document.createElement('label');
        switchLabel.className = 'panel-type-switch';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = this.summaryType === HNEnhancer.SummaryType.SIDEPANEL;

        const slider = document.createElement('span');
        slider.className = 'panel-type-slider';

        const sideLabel = document.createElement('span');
        sideLabel.className = 'panel-type-label' + (this.summaryType === HNEnhancer.SummaryType.SIDEPANEL ? ' active' : '');
        sideLabel.textContent = 'G Side';

        // Add event listener
        input.onchange = () => {
            const newType = input.checked ? HNEnhancer.SummaryType.SIDEPANEL : HNEnhancer.SummaryType.INLINE;
            this.switchToPanelType(newType);

            // Update labels
            inlineLabel.className = 'panel-type-label' + (!input.checked ? ' active' : '');
            sideLabel.className = 'panel-type-label' + (input.checked ? ' active' : '');

            // Return focus to the main content area
            if (this.currentComment) {
                this.currentComment.focus();
            } else {
                // If no current comment, focus the main content area
                const mainContent = document.querySelector('.fatitem') || document.body;
                mainContent.focus();
            }

            // Prevent the switch from keeping focus
            input.blur();
        };

        // Assemble the switch
        switchLabel.appendChild(input);
        switchLabel.appendChild(slider);

        // Assemble the toggle
        toggle.appendChild(inlineLabel);
        toggle.appendChild(switchLabel);
        toggle.appendChild(sideLabel);

        document.body.appendChild(toggle);
        return toggle;
    }

    switchToPanelType(newType) {
        // If switching to the same type, do nothing
        if (this.summaryType === newType) return;

        // Clean up existing panel
        if (this.summaryType === HNEnhancer.SummaryType.INLINE) {
            // Remove inline panel elements

            // TODO - these styles are not right - need to review and fix them.
            const existingPanel = document.querySelector('.summary-panel');
            const existingToggle = document.querySelector('.summary-panel-toggle');
            if (existingPanel) existingPanel.remove();
            if (existingToggle) existingToggle.remove();
        } else {
            // Close side panel if it's open
            if (this.isPanelVisible) {
                this.toggleSidePanel();
            }
        }

        // Update type and create new panel
        this.summaryType = newType;
        this.summaryPanel = this.createSummaryPanel();

        // Update current comment's summary in the new panel
        if (this.currentComment) {
            this.updateSummaryPanel(this.currentComment);
        }
    }
}

document.hnEnhancer = new HNEnhancer();                       // Initialize immediately
console.log('Initialized HN Enhancer');

// Also initialize when DOM content is loaded (backup)
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    new HNEnhancer();
});