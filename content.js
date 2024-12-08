class HNEnhancer {
    constructor() {
        this.authorStats = new Map();       // Store comment counts
        this.authorComments = new Map();    // Store comment elements by author
        this.popup = this.createPopup();
        this.postAuthor = this.getPostAuthor();
        this.activeHighlight = null;        // Track currently highlighted element
        this.highlightTimeout = null;       // Track highlight timeout
        this.currentComment = null;         // Track currently focused comment
        this.init();
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
            const response = await fetch(`https://hn.algolia.com/api/v1/users/${username}`);
            const userInfoResponse = await response.json();
            return {
                karma: userInfoResponse.karma || 'Not found',
                about: userInfoResponse.about || 'No about information'
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

        // Remove highlight class after animation completes
        this.highlightTimeout = setTimeout(() => {
            authorElement.classList.remove('highlight-author');
            this.activeHighlight = null;
            this.highlightTimeout = null;
        }, 2000); // Match this with the CSS animation duration
    }

    initCommentNavigation() {
        // Initialize the first comment as current
        const firstComment = document.querySelector('.athing.comtr');
        if (firstComment) {
            this.setCurrentComment(firstComment);
        }

        // Add keyboard event listener
        document.addEventListener('keydown', (e) => {
            // Only handle navigation when not in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.key) {
                case 'j': // Next comment at same depth
                    e.preventDefault();
                    this.navigateNextSameDepth();
                    break;
                case 'k': // Previous comment at same depth
                    e.preventDefault();
                    this.navigatePrevSameDepth();
                    break;
                case 'l': // Next child
                    e.preventDefault();
                    this.navigateNextChild();
                    break;
                case 'h': // Previous parent
                    e.preventDefault();
                    this.navigatePrevParent();
                    break;
            }
        });
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
            // Add visual indicator
            const indicator = document.createElement('span');
            indicator.className = 'current-comment-indicator';
            indicator.textContent = '👉'; // Current comment indicator
            indicator.style.marginRight = '5px';

            const commentHead = comment.querySelector('.comhead');
            if (commentHead) {
                commentHead.insertBefore(indicator, commentHead.firstChild);
            }

            // Scroll into view if needed
            comment.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
    }

    getCommentDepth(comment) {
        const indent = comment.querySelector('.ind img');
        return indent ? parseInt(indent.width) : 0;
    }

    navigateNextSameDepth() {
        if (!this.currentComment) return;

        const currentDepth = this.getCommentDepth(this.currentComment);
        let next = this.currentComment.nextElementSibling;

        while (next) {
            if (next.classList.contains('athing') && next.classList.contains('comtr')) {
                const nextDepth = this.getCommentDepth(next);
                if (nextDepth === currentDepth) {
                    this.setCurrentComment(next);
                    return;
                }
            }
            next = next.nextElementSibling;
        }
    }

    navigatePrevSameDepth() {
        if (!this.currentComment) return;

        const currentDepth = this.getCommentDepth(this.currentComment);
        let prev = this.currentComment.previousElementSibling;

        while (prev) {
            if (prev.classList.contains('athing') && prev.classList.contains('comtr')) {
                const prevDepth = this.getCommentDepth(prev);
                if (prevDepth === currentDepth) {
                    this.setCurrentComment(prev);
                    return;
                }
            }
            prev = prev.previousElementSibling;
        }
    }

    navigateNextChild() {
        if (!this.currentComment) return;

        const currentDepth = this.getCommentDepth(this.currentComment);
        let next = this.currentComment.nextElementSibling;

        while (next) {
            if (next.classList.contains('athing') && next.classList.contains('comtr')) {
                const nextDepth = this.getCommentDepth(next);
                if (nextDepth > currentDepth) {
                    this.setCurrentComment(next);
                    return;
                }
                if (nextDepth < currentDepth) {
                    return; // No child comments
                }
            }
            next = next.nextElementSibling;
        }
    }

    navigatePrevParent() {
        if (!this.currentComment) return;

        const currentDepth = this.getCommentDepth(this.currentComment);
        let prev = this.currentComment.previousElementSibling;

        while (prev) {
            if (prev.classList.contains('athing') && prev.classList.contains('comtr')) {
                const prevDepth = this.getCommentDepth(prev);
                if (prevDepth < currentDepth) {
                    this.setCurrentComment(prev);
                    return;
                }
            }
            prev = prev.previousElementSibling;
        }
    }

    updateCommentCounts() {
        this.authorStats.clear();
        this.authorComments.clear();

        // Get all comments
        const comments = document.querySelectorAll('.athing.comtr');

        // Count comments by author and the author comments elements by author
        comments.forEach(comment => {
            const authorElement = comment.querySelector('.hnuser');
            if (authorElement) {
                const author = authorElement.textContent;
                this.authorStats.set(author, (this.authorStats.get(author) || 0) + 1);

                if (!this.authorComments.has(author)) {
                    this.authorComments.set(author, []);
                }
                this.authorComments.get(author).push(comment);
            }
        });

        comments.forEach(comment => {
            const authorElement = comment.querySelector('.hnuser');
            if (authorElement && !authorElement.querySelector('.comment-count')) {
                const author = authorElement.textContent;
                const count = this.authorStats.get(author);

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
        targetComment.scrollIntoView({behavior: 'smooth', block: 'center'});

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
        });
    }

    init() {
        console.log('HN Enhancer initializing...');
        this.updateCommentCounts();
        this.setupHoverEvents();
        this.initCommentNavigation(); // Initialize comment navigation
    }
}

// Initialize immediately
console.log('Content script loaded');
new HNEnhancer();

// Also initialize when DOM content is loaded (backup)
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    new HNEnhancer();
});