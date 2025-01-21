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

    console.log('Background script received message type:', message.type);

    // Handle the message
    switch (message.type) {
        case 'HN_SHOW_OPTIONS':
            chrome.runtime.openOptionsPage();
            break;
        case 'HN_FETCH_USER_INFO':
            // fetch user info from HN API
            (async () => {
                try {
                    const result = await fetchUserInfo(message.data.username);
                    sendResponse({success: true, result: result});
                } catch (error) {
                    console.error(`Message listener HN_FETCH_USER_INFO: Error thrown by fetchUserInfo(): ${error}`);
                    sendResponse({success: false, error: error.message});
                }
            })();

            // indicate that sendResponse will be called later and hence keep the message channel open
            return true;

        // case 'HN_FETCH_THREAD':
        //     // fetch user info from HN API
        //     (async () => {
        //         try {
        //             const result = await fetchHNThread(message.data.itemId);
        //             sendResponse({success: true, result: result});
        //         } catch (error) {
        //             console.error(`Message listener HN_FETCH_THREAD: Error thrown by fetchHNThread(): ${error}`);
        //             sendResponse({success: false, error: error.message});
        //         }
        //     })();
        //
        //     // indicate that sendResponse will be called later and hence keep the message channel open
        //     return true;

        case 'HN_FETCH_THREAD':
            return handleAsyncMessage(
                message.type,
                () => fetchHNThread(message.data.itemId),
                sendResponse
            );

        case 'FETCH_OLLAMA_MODELS':
            return handleAsyncMessage(
                message.type,
                () => fetchOllamaModels(),
                sendResponse
            );
        default:
            console.log('Unknown message type:', message.type);
    }
});

function handleAsyncMessage(messageType, fetchApi, sendResponse) {
    (async () => {
        try {
            const result = await fetchApi();
            sendResponse({ success: true, result });
        } catch (error) {
            console.error(`Message listener ${messageType}: Error thrown by ${fetchApi.name}: ${error}`);
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
}

async function fetchUserInfo(username) {
    const response = await fetch(`https://hn.algolia.com/api/v1/users/${username}`);
    if (!response.ok) {
        throw new Error(`fetchUserInfo(): HTTP error from HN API /v1/users: Error code: ${response.status}. Text: '${response.statusText}'`);
    }

    const userApiResponse = await response.json();
    return {
        karma: userApiResponse.karma, about: userApiResponse.about
    };
}

async function fetchHNThread(itemId) {
    const response = await fetch(`https://hn.algolia.com/api/v1/items/${itemId}`);
    if (!response.ok) {
        throw new Error(`fetchHNThread(): HTTP error from HN API /v1/items Error code: ${response.status}. Text: '${response.statusText}'`);
    }
    const jsonResponse = await response.json();
    return jsonResponse;
}

async function fetchOllamaModels() {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) {
        throw new Error(`fetchOllamaModels(): HTTP error from Ollama API /api/tags Error code: ${response.status}. Text: '${response.statusText}'`);
    }
    const jsonResponse = await response.json();
    return jsonResponse;
}

// chrome.runtime.onInstalled.addListener(onInstalled);