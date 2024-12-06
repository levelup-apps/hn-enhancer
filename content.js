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

            // Extract user information using more specific selectors
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
        // Find all comments using the correct HN class
        const comments = document.querySelectorAll('.athing.comtr');

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