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
