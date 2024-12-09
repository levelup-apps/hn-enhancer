class HNEnhancer {
    constructor() {
        this.authorComments = new Map();    // Store comment elements by author
        this.popup = this.createPopup();
        this.postAuthor = this.getPostAuthor();
        this.activeHighlight = null;        // Track currently highlighted element
        this.highlightTimeout = null;       // Track highlight timeout
        this.currentComment = null;         // Track currently focused comment
        this.helpModal = this.createHelpModal();
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

        let lastKeyTime = 0;
        let lastKey = '';

        // Add keyboard event listener
        document.addEventListener('keydown', (e) => {
            // Only handle navigation when not in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            const currentTime = Date.now();

            switch (e.key) {

                case 'j': // Next comment at same depth (same as 'next' hyperlink)
                    e.preventDefault();

                    // Find the 'next' hyperlink in the HN nav panel and navigate to it.
                    const nextComment = this.getNavElementByName(this.currentComment,'next');
                    if (nextComment) {
                        this.setCurrentComment(nextComment);
                    }
                    break;

                case 'k': // Previous comment at same depth (same as 'prev' hyperlink)
                    e.preventDefault();

                    // Find the 'prev' hyperlink in the HN nav panel and navigate to it.
                    const prevComment = this.getNavElementByName(this.currentComment,'prev');
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
                    const rootComment = this.getNavElementByName(this.currentComment,'root');
                    if (rootComment) {
                        this.setCurrentComment(rootComment);
                    }
                    break;

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
                    if (lastKey === 'g' && currentTime - lastKeyTime < 500) {
                        const firstComment = document.querySelector('.athing.comtr');
                        if (firstComment) {
                            this.setCurrentComment(firstComment);
                        }
                    }
                    lastKey = 'g';
                    lastKeyTime = currentTime;
                    break;

                case 'o': // Open the original post in new window
                    e.preventDefault();
                    const postLink = document.querySelector('.titleline a');
                    if (postLink) {
                        window.open(postLink.href, '_blank');
                    }
                    break;

                case '?': // Toggle help modal
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
        });
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

            // Scroll into the comment view if needed
            comment.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
    }

    getCommentDepth(comment) {
        const indent = comment.querySelector('.ind img');
        return indent ? parseInt(indent.width) : 0;
    }

    navigateNextChild() {
        if (!this.currentComment) return;

        // The comments are arranged as a flat array of table rows where the hierarchy is represented by the depth of the element.
        //  So the next child is the next element with a higher depth in the array.
        //  If the next sibling has a lower depth, it is a sibling of the parent comment.
        const currentDepth = this.getCommentDepth(this.currentComment);
        let next = this.currentComment.nextElementSibling;

        while (next) {
            if (next.classList.contains('athing') && next.classList.contains('comtr')) {
                const nextDepth = this.getCommentDepth(next);
                if (nextDepth > currentDepth) {
                    // This is a child of the current comment. Set it as the current comment
                    this.setCurrentComment(next);
                    return;
                }
                if (nextDepth <= currentDepth) {
                    this.setCurrentComment(next);
                    return; // No child comments
                }
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
            {key: 'j', description: 'Next comment at same level'},
            {key: 'k', description: 'Previous comment at same level'},
            {key: 'l', description: 'Next child comment'},
            {key: 'h', description: 'Go to parent comment'},
            {key: 'z', description: 'Scroll to current comment'},
            {key: 'Space', description: 'Collapse/expand current comment'},
            {key: 'gg', description: 'Go to first comment'},
            {key: 'r', description: 'Go to comment root'},
            {key: 'o', description: 'Open original post in new window'},
            {key: '?', description: 'Toggle this help modal'}
        ];

        const table = document.createElement('table');
        shortcuts.forEach(({key, description}) => {
            const row = table.insertRow();
            const keyCell = row.insertCell();
            const descCell = row.insertCell();

            const kbd = document.createElement('kbd');
            kbd.textContent = key;
            keyCell.appendChild(kbd);
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
        icon.title = 'Keyboard Shortcuts (Press ? to toggle)';

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
}

document.hnEnhancer = new HNEnhancer();                       // Initialize immediately
console.log('Initialized HN Enhancer');

// Also initialize when DOM content is loaded (backup)
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    new HNEnhancer();
});