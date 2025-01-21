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

chrome.runtime.onMessage.addListener( (message, sender, sendResponse) => {

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

        default:
            console.log('Unknown message type:', message.type);
    }
});

async function fetchUserInfo(username) {
    const response = await fetch(`https://hn.algolia.com/api/v1/users/${username}`, {cache: 'force-cache'});
    if (!response.ok) {
        throw new Error(`fetchUserInfo(): Error from HN API /v1/users: Error code: ${response.status} Text: '${response.statusText}'`);
    }

    const userApiResponse = await response.json();
    return {
        karma: userApiResponse.karma, about: userApiResponse.about
    };
}

// chrome.runtime.onInstalled.addListener(onInstalled);