class HNEnhancer {
    constructor() {
        this.authorStats = new Map(); // Store comment counts
        this.popup = this.createPopup();
        this.init();
    }

    createPopup() {
        const popup = document.createElement('div');
        popup.className = 'author-popup';
        document.body.appendChild(popup);
        return popup;
    }

    async fetchUserInfo(username) {
        try {
            const response = await fetch(`https://news.ycombinator.com/user?id=${username}`);
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');

            // Extract user information
            const userInfo = {
                karma: doc.querySelector('td:contains("karma:")').nextElementSibling.textContent,
                created: doc.querySelector('td:contains("created:")').nextElementSibling.textContent,
                about: doc.querySelector('td:contains("about:")').nextElementSibling?.textContent || 'No about information'
            };

            return userInfo;
        } catch (error) {
            console.error('Error fetching user info:', error);
            return null;
        }
    }

    updateCommentCounts() {
        const comments = document.querySelectorAll('.comtr');

        comments.forEach(comment => {
            const authorElement = comment.querySelector('.hnuser');
            if (authorElement) {
                const author = authorElement.textContent;
                this.authorStats.set(author, (this.authorStats.get(author) || 0) + 1);
            }
        });

        // Add comment counts to author names
        comments.forEach(comment => {
            const authorElement = comment.querySelector('.hnuser');
            if (authorElement && !authorElement.querySelector('.comment-count')) {
                const author = authorElement.textContent;
                const count = this.authorStats.get(author);
                const countSpan = document.createElement('span');
                countSpan.className = 'comment-count';
                countSpan.textContent = `(${count})`;
                authorElement.appendChild(countSpan);
            }
        });
    }

    setupHoverEvents() {
        document.querySelectorAll('.hnuser').forEach(authorElement => {
            authorElement.addEventListener('mouseenter', async (e) => {
                const username = e.target.textContent.replace(/\(\d+\)$/, '').trim();
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
        this.updateCommentCounts();
        this.setupHoverEvents();
    }
}

// Initialize the enhancer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new HNEnhancer();
});