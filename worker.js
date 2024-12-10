console.log('in worker.js');

const HN_ITEM_URL = "https://news.ycombinator.com/item";

// Allows users to open the side panel by clicking on the action toolbar icon
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// This is Google's sample code - same as below.
// chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
//     if (!tab.url) return;
//     // const url = new URL(tab.url);
//     // Enables the side panel on google.com
//     const isHNItemPage = tab.url && tab.url.startsWith(HN_ITEM_URL);
//     if (isHNItemPage) {
//         await chrome.sidePanel.setOptions({
//             tabId: tab.id,
//             path: 'sidepanel.html',
//             enabled: true
//         });
//     } else {
//         // Disables the side panel on all other sites
//         await chrome.sidePanel.setOptions({
//             tabId: tab.id,
//             enabled: false
//         });
//     }
// });

// Handle initial state when the extension is loaded
chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
        const isHNItemPage = tab.url && tab.url.startsWith(HN_ITEM_URL);
        chrome.sidePanel.setOptions({
            tabId: tab.id,
            path: 'sidepanel.html',
            enabled: isHNItemPage
        });
        console.log(`worker.js: All tabs: ${isHNItemPage ? 'enabled' : 'disabled'} side panel for tab ${tab.id}. isHNItemPage = ${isHNItemPage}`);
    });
});

// Handle subsequent navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        const isHNItemPage = tab.url && tab.url.startsWith(HN_ITEM_URL);
        chrome.sidePanel.setOptions({
            tabId: tabId,
            path: 'sidepanel.html',
            enabled: isHNItemPage
        });
        console.log(`worker.js: Updated Tab: ${isHNItemPage ? 'enabled' : 'disabled'} side panel for tab ${tabId}. isHNItemPage = ${isHNItemPage}`);
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(`worker.js: Message Listener. Received message: ${JSON.stringify(message.type)}`);

    switch (message.type) {
        case 'open_side_panel':
            // Handle the async operation
            (async () => {
                try {
                    console.log(`worker.js: Calling Chrome API to open the sidepanel...`);
                    await chrome.sidePanel.open({tabId: sender.tab.id});
                    sendResponse({success: true});
                } catch (error) {
                    console.error(`worker.js: Error handling message open_side_panel. Error:`, error);
                    sendResponse({success: false, error: error.message});
                }
            })();

            // Return true to keep the messaging channel so that you can call sendResponse inside the async handler
            // Without this, the message port would close immediately and sendResponse wouldn't work
            return true;

        case 'side_panel_loaded':

            // Forward message from side panel to the main content script running in HN tab.
            //  We have to do this because the only way the Chrome side panel can communicate to the extension's content script is through the worker.
            //  The reverse communication (from content script to side panel) works directly, it does not require the worker to forward the message.

            (async () => {
                try {
                    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                    const currentTab = tabs[0];

                    if (currentTab?.url?.startsWith('https://news.ycombinator.com/item')) {
                        console.log(`worker.js: Forwarding message side_panel_loaded to HN tab ${currentTab.id}`);
                        const response = await chrome.tabs.sendMessage(currentTab.id, message);
                        console.log(`worker.js: Success forwarding message side_panel_loaded. Received response: ${JSON.stringify(response)}`);
                        sendResponse(response);
                    } else {
                        console.log('worker.js: No valid HN tab found to forward message to');
                        sendResponse({ success: false, error: 'No valid HN tab found to forward message to.' });
                    }
                } catch (error) {
                    console.error(`worker.js: Error forwarding side_panel_loaded. Error: `, error);
                    sendResponse({ success: false, error: error.message });
                }
            })();

            // Return true to keep the messaging channel so that you can call sendResponse inside the async handler
            // Without this, the message port would close immediately and sendResponse wouldn't work
            return true;

        default:
            console.log(`worker.js: Message not handled by worker. Message type: ${message.type}`);
            return false;
    }
});