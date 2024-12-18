class Navigation {
    constructor(summaryPanel) {
        this.summaryPanel = summaryPanel;
        this.currentComment = null;
        this.activeHighlight = null;
        this.highlightTimeout = null;
    }

    initCommentNavigation() {
        if (!this.summaryPanel) {
            console.error(`navigation.js: initCommentNavigation(): Summary panel is not available, so cannot initialize comment navigation.`);
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
            if (result) {
                lastKey = result.lastKey;
                lastKeyPressTime = result.lastKeyPressTime;
            }
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
                    this.currentComment.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        return { lastKey: lastKey, lastKeyPressTime: lastKeyPressTime };
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
            console.log('navigation.js: setCurrentComment(): comment is null, so cannot set the current comment.');
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
        // console.log(`navigation.js: setCurrentComment(): Updating summary panel for comment with author: ${authorElement.textContent}`);
        this.updateSummaryPanel(comment);

        // Scroll into the comment view if needed
        comment.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    updateSummaryPanel(comment) {
        if (!comment) {
            console.log('navigation.js: updateSummaryPanel(): No comment provided to updateSummaryPanel, so not updating the summary panel.');
            return;
        }

        // Make sure that the panel to display the new content is available
        if (!this.summaryPanel.querySelector('.summary-panel-content')) {
            console.error(`navigation.js: updateSummaryPanel(): Element .summary-panel-content not found in the summary panel.`);
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
        summaryTextElement.innerHTML = text;
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

    highlightAuthor(authorElement) {
        this.clearHighlight();

        // Add highlight class to trigger animation
        authorElement.classList.add('highlight-author');
        this.activeHighlight = authorElement;
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

    toggleSummaryPanel() {
        if (!this.summaryPanel) {
            console.error(`navigation.js: toggleSummaryPanel(): Summary panel is not available, so cannot toggle the summary panel.`);
            return;
        }

        const summaryPanel = this.summaryPanel;
        const resizer = document.querySelector('.panel-resizer');

        // if summary panel and resizer are hidden, show it. Otherwise, hide it.
        if (summaryPanel.style.display === 'none') {
            // Reset the width of the summary panel width based on the available size
            const mainWrapper = document.querySelector('.main-content-wrapper');
            const maxAvailableWidth = mainWrapper.offsetWidth - 8;  // 8px resizer width
            const { minWidth, maxWidth } = this.calculatePanelConstraints(maxAvailableWidth);
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
}

export { Navigation };
