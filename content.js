import { Popup } from './popup.js';
import { Navigation } from './navigation.js';
import { Summarization } from './summarization.js';

class HNEnhancer {

    static AI_AVAILABLE = {
        YES: 'readily',
        NO: 'no',
        AFTER_DOWNLOAD: 'after-download'
    }

    constructor() {
        this.authorComments = new Map();    // Store comment elements by author
        this.popup = new Popup();
        this.postAuthor = this.getPostAuthor();
        this.activeHighlight = null;        // Track currently highlighted element
        this.highlightTimeout = null;       // Track highlight timeout
        this.currentComment = null;         // Track currently focused comment
        this.helpModal = this.createHelpModal();
        this.summaryPanel = this.createSummaryPanel(); // Initialize the summary panel
        this.isAiAvailable = HNEnhancer.AI_AVAILABLE.NO;

        this.createHelpIcon();
        this.updateCommentCounts();
        this.setupHoverEvents();

        // Once the summary panel is loaded, init the comment navigation, which updates the panel with the first comment
        this.navigation = new Navigation(this.summaryPanel);
        this.navigation.initCommentNavigation(); // Initialize comment navigation

        // Origin -> news.ycombinator.com; Registration for Summarization API
        const otMeta = document.createElement('meta');
        otMeta.httpEquiv = 'origin-trial';
        otMeta.content = 'Ah+d1HFcvvHgG3aB5OfzNzifUv02EpQfyQBlED1zXGCt8oA+XStg86q5zAwr7Y/UFDCmJEnPi019IoJIoeTPugsAAABgeyJvcmlnaW4iOiJodHRwczovL25ld3MueWNvbWJpbmF0b3IuY29tOjQ0MyIsImZlYXR1cmUiOiJBSVN1bW1hcml6YXRpb25BUEkiLCJleHBpcnkiOjE3NTMxNDI0MDB9';
        document.head.prepend(otMeta);

        this.summarization = new Summarization();
        this.summarization.initSummarizationAI();
    }

    toggleHelpModal(show) {
        this.helpModal.style.display = show ? 'flex' : 'none';
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

    setCurrentComment(comment) {
        this.navigation.setCurrentComment(comment);
    }

    updateSummaryPanel(comment) {
        this.navigation.updateSummaryPanel(comment);
    }

    summarizeText(text) {
        return this.summarization.summarizeText(text);
    }

    updateSummaryText(text) {
        this.summarization.updateSummaryText(text);
    }

    navigateNextChild() {
        this.navigation.navigateNextChild();
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
                    this.popup.showPopup(`
                        <strong>${username}</strong><br>
                        Karma: ${userInfo.karma}<br>
                        About: ${userInfo.about}
                    `, e.target.getBoundingClientRect());
                }
            });

            authorElement.addEventListener('mouseleave', () => {
                this.popup.hidePopup();
            });

            // Add event listener for Esc key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.popup.hidePopup();
                }
            });

            // Add event listener for clicks outside the popup
            document.addEventListener('click', (e) => {
                if (!this.popup.popup.contains(e.target) && !e.target.classList.contains('hnuser')) {
                    this.popup.hidePopup();
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

}

// Initialize the HNEnhancer. Note that we are loading this content script with the default run_at of 'document_idle'.
// So this script is injected only after the DOM is loaded and all other scripts have finished executing.
// This guarantees that the DOM of the main HN page is loaded by the time this script runs.
document.hnEnhancer = new HNEnhancer();
console.log('HN Enhancer initialized and ready');
