class SidePanel {
    constructor() {
        this.domContentLoaded = false;
        this.panel = document.querySelector('.summary-panel');
        this.toggleBtn = document.querySelector('.summary-panel-toggle');
        this.isPanelCollapsed = false;
        this.init();
    }

    init() {

        console.log(`sidepanel.js: init(): this.domContentLoaded: ${this.domContentLoaded}`);

        // Listen for toggle button clicks
        this.toggleBtn.addEventListener('click', () => this.togglePanel());

        // Listen for Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeSidePanel();
            }
        });

        // Listen for messages from content script

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

            console.log(`sidepanel.js: Received message: ${JSON.stringify(message.type)}. this.domContentLoaded: ${this.domContentLoaded}`);

            switch (message.type) {
                case 'is_panel_open':
                    sendResponse({ success: true, data: {isOpen: this.domContentLoaded} });
                    break;

                case 'update_side_panel':
                    this.updateContent(message.data);
                    sendResponse({success: true});
                    break;

                case 'close_side_panel':
                    this.closeSidePanel();
                    sendResponse({success: true});
                    break;

                default:
                    console.log('sidepanel.js: Unhandled message type:', message.type);
            }
        });
    }

    togglePanel() {
        console.log(`sidepanel.js: togglePanel(): this.domContentLoaded: ${this.domContentLoaded}`);

        this.isPanelCollapsed ? this.openSidePanel() : this.closeSidePanel();
        // this.isPanelCollapsed = !this.isPanelCollapsed;

        // this.panel.classList.toggle('collapsed', this.isPanelCollapsed);
        // this.toggleBtn.classList.toggle('collapsed', this.isPanelCollapsed);
        // this.toggleBtn.innerHTML = this.isPanelCollapsed ? '◀' : '▶';

        // this.isPanelCollapsed = !this.isPanelCollapsed;
        // this.panel.classList.toggle('collapsed', this.isPanelCollapsed);
        // this.toggleBtn.classList.toggle('collapsed', this.isPanelCollapsed);
        // this.toggleBtn.innerHTML = this.isPanelCollapsed ? '◀' : '▶';
    }

    async openSidePanel() {
        console.log('sidepanel.js: openSidePanel(): Opening side panel');
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'open_side_panel',
                data: {}
            });
            if (response.success) {
                this.isPanelCollapsed = false;
            } else {
                console.error('sidepanel.js: Failed to open side panel:', response.error);
            }
        } catch (error) {
            console.error('sidepanel.js: Error opening side panel:', error);
        }
    }

    closeSidePanel() {
        // Close the side panel using Chrome's API
        // chrome.runtime.sendMessage({ type: 'closeSidePanel' })
        console.log('sidepanel.js: closeSidePanel(): Closing side panel');
        this.isPanelCollapsed = true;
        window.close();
    }

    updateContent(data) {
        const authorElem = document.querySelector('.summary-author');
        const metadataElem = document.querySelector('.summary-metadata');
        const textElem = document.querySelector('.summary-text');

        if (authorElem && metadataElem && textElem) {
            authorElem.textContent = `@${data.author}`;
            metadataElem.textContent = `${data.points} • ${data.timestamp}`;
            textElem.textContent = data.summary;
        } else {
            console.error('sidepanel.js: Required elements not found');
        }
    }
}

// Initialize the panel
window.sidePanel = new SidePanel();

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    sidePanel.domContentLoaded = true;
    console.log(`sidepanel.js: DOMContentLoaded event(): sidePanel.domContentLoaded: ${sidePanel.domContentLoaded}`);

    // Notify content.js that sidepanel is ready
    try {
        console.log(`sidepanel.js: DOMContentLoaded event(): Sending message side_panel_loaded`);
        const response = await chrome.runtime.sendMessage({
            type: 'side_panel_loaded',
            data: {}
        });

        console.log(`sidepanel.js: DOMContentLoaded event(): Success sending message side_panel_loaded. Received response: ${JSON.stringify(response)}`);
    } catch (error) {
        console.error(`sidepanel.js: DOMContentLoaded event(): Error sending message side_panel_loaded. Error: ${error.message}`);
    }
});