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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    console.log('Background script received message of type:', message.type);

    // Handle the message
    switch (message.type) {
        case 'HN_SHOW_OPTIONS':
            chrome.runtime.openOptionsPage();
            break;

        case 'HN_FETCH_USER_INFO':
            return handleAsyncMessage(
                message,
                () => fetchUserInfo(message.data.username),
                sendResponse
            );

        case 'HN_FETCH_THREAD':
            return handleAsyncMessage(
                message,
                () => fetchHNThread(message.data.itemId),
                sendResponse
            );

        case 'FETCH_OLLAMA_MODELS':
            return handleAsyncMessage(
                message,
                () => fetchOllamaModels(),
                sendResponse
            );
        default:
            console.log('Unknown message type:', message.type);
    }
});

// Handle async message and send response
function handleAsyncMessage(message, asyncOperation, sendResponse) {
    (async () => {
        try {
            const response = await asyncOperation();
            sendResponse({ success: true, data: response});
        } catch (error) {
            console.error(`Message: ${message.type}. Error: ${error}`);
            sendResponse({ success: false, error: error.toString() });
        }
    })();

    // indicate that sendResponse will be called later and hence keep the message channel open
    return true;
}

async function fetchUserInfo(username) {
    try {
        return await fetchWithTimeout(
            `https://hn.algolia.com/api/v1/users/${username}`
        );
    } catch (error) {
        console.error(`fetchUserInfo(): Error fetching user info for ${username}: ${error}`);
        throw error;
    }
}

async function fetchHNThread(itemId) {
    try {
        return await fetchWithTimeout(
            `https://hn.algolia.com/api/v1/items/${itemId}`
        );
    } catch (error) {
        console.error(`fetchHNThread(): Error fetching HN thread ${itemId}: ${error}`);
        throw error;
    }
}

async function fetchOllamaModels() {
    try {
        return await fetchWithTimeout(
            'http://localhost:11434/api/tags',
            {},
            10000  // Longer timeout for local API
        );
    } catch (error) {
        console.error(`fetchOllamaModels(): Error fetching Ollama models: ${error}`);
        throw error;
    }
}

// chrome.runtime.onInstalled.addListener(onInstalled);

// Utility function for API calls with timeout
async function fetchWithTimeout(url, options = {}, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);

        if (!response.ok) {
            throw new Error(
                `HTTP Error ${response.status}: ${response.statusText || 'No error details available'}. API url: ${url}`
            )
        }

        return await response.json();
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout} ms: ${url}`);
        }
        throw error;
    }
}