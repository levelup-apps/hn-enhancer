chrome.runtime.onMessage.addListener( (message) => {
    // Handle the message
    switch (message.type) {
        case 'HN_SHOW_OPTIONS':
            chrome.runtime.openOptionsPage();
            break;
        default:
            console.log('Unknown message type:', message.type);
    }
});

async function onInstalled() {
    const data = await chrome.storage.sync.get('settings');
    const providerSelection = data.settings?.providerSelection;

    if (!providerSelection) {
        try {
            chrome.runtime.openOptionsPage();
        } catch (e) {
            console.log('Error opening options page:', e);
        }
    }
}

// chrome.runtime.onInstalled.addListener(onInstalled);