class HNEnhancer {
    constructor() {
        this.authorStats = new Map(); // Store comment counts
        this.authorComments = new Map(); // Store comment elements by author
        this.popup = this.createPopup();
        this.postAuthor = this.getPostAuthor();
        this.init();
    }

    createPopup() {
        const popup = document.createElement('div');
        popup.className = 'author-popup';
        document.body.appendChild(popup);
        return popup;
    }

    getPostAuthor() {
        // Get the post author from the main post
        const postAuthorElement = document.querySelector('.fatitem .hnuser');
        return postAuthorElement ? postAuthorElement.textContent : null;
    }

    async fetchUserInfo(username) {
        try {
            const response = await fetch(`https://news.ycombinator.com/user?id=${username}`);
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            const tables = doc.getElementsByTagName('table');
            let userInfo = {
                karma: 'Not found',
                created: 'Not found',
                about: 'No about information'
            };

            for (let table of tables) {
                const cells = table.getElementsByTagName('td');
                for (let i = 0; i < cells.length; i++) {
                    const cell = cells[i];
                    if (cell.textContent.includes('karma:')) {
                        userInfo.karma = cells[i + 1].textContent.trim();
                    } else if (cell.textContent.includes('created:')) {
                        userInfo.created = cells[i + 1].textContent.trim();
                    } else if (cell.textContent.includes('about:')) {
                        userInfo.about = cells[i + 1]?.textContent.trim() || 'No about information';
                    }
                }
            }

            return userInfo;
        } catch (error) {
            console.error('Error fetching user info:', error);
            return null;
        }
    }

    updateCommentCounts() {
        // Clear previous data
        this.authorStats.clear();
        this.authorComments.clear();

        // Find all comments using the correct HN class
        const comments = document.querySelectorAll('.athing.comtr');

        // First pass: collect statistics and store comments
        comments.forEach(comment => {
            const authorElement = comment.querySelector('.hnuser');
            if (authorElement) {
                const author = authorElement.textContent;
                // Update comment count
                this.authorStats.set(author, (this.authorStats.get(author) || 0) + 1);

                // Store comment reference
                if (!this.authorComments.has(author)) {
                    this.authorComments.set(author, []);
                }
                this.authorComments.get(author).push(comment);
            }
        });

        // Second pass: add navigation and counts
        comments.forEach(comment => {
            const authorElement = comment.querySelector('.hnuser');
            if (authorElement && !authorElement.querySelector('.comment-count')) {
                const author = authorElement.textContent;
                const count = this.authorStats.get(author);

                // Create container for count and navigation
                const container = document.createElement('span');

                // Add comment count
                const countSpan = document.createElement('span');
                countSpan.className = 'comment-count';
                countSpan.textContent = `(${count})`;
                container.appendChild(countSpan);

                // Add navigation arrows
                const navPrev = document.createElement('span');
                navPrev.className = 'author-nav';
                navPrev.textContent = ' ↑';
                navPrev.title = 'Go to previous comment by this author';
                navPrev.onclick = (e) => {
                    e.preventDefault();
                    this.navigateAuthorComments(author, comment, 'prev');
                };
                container.appendChild(navPrev);

                const navNext = document.createElement('span');
                navNext.className = 'author-nav';
                navNext.textContent = '↓ ';
                navNext.title = 'Go to next comment by this author';
                navNext.onclick = (e) => {
                    e.preventDefault();
                    this.navigateAuthorComments(author, comment, 'next');
                };
                container.appendChild(navNext);

                // Add post author indicator if applicable
                if (author === this.postAuthor) {
                    const authorIndicator = document.createElement('span');
                    authorIndicator.className = 'post-author';
                    authorIndicator.textContent = '👑';
                    authorIndicator.title = 'Post Author';
                    container.appendChild(authorIndicator);
                }

                authorElement.appendChild(container);
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
            Created: ${userInfo.created}<br>
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
        console.log('HN Enhancer initializing...'); // Debug log
        this.updateCommentCounts();
        this.setupHoverEvents();
    }
}

// Initialize immediately
console.log('Content script loaded'); // Debug log
new HNEnhancer();

// Also initialize when DOM content is loaded (backup)
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded'); // Debug log
    new HNEnhancer();
});