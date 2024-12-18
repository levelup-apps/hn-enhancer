class Popup {
    constructor() {
        this.popup = this.createPopup();
    }

    createPopup() {
        const popup = document.createElement('div');
        popup.className = 'author-popup';
        document.body.appendChild(popup);
        return popup;
    }

    showPopup(content, position) {
        this.popup.innerHTML = content;
        this.popup.style.left = `${position.left}px`;
        this.popup.style.top = `${position.top}px`;
        this.popup.style.display = 'block';
    }

    hidePopup() {
        this.popup.style.display = 'none';
    }
}

export { Popup };
