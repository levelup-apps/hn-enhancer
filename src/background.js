import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

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

        case 'FETCH_API_REQUEST':
            return handleAsyncMessage(
                message,
                async () => await fetchWithTimeout(message.data.url, message.data),
                sendResponse
            );
        case 'HN_SUMMARIZE':
            return handleAsyncMessage(
                message,
                async () => await summarizeText(message.data),
                sendResponse
            );
        default:
            console.log('Unknown message type:', message.type);
    }
});

async function summarizeText(data) {

    try {

        const { aiProvider, modelName, apiKey, systemPrompt, userPrompt, parameters = {} } = data;

        let model;
        switch (aiProvider) {
            // AI provider can be 'openai', 'anthropic', 'deepseek' or 'openrouter'
            case 'openai':
                const openai = createOpenAI({
                    apiKey: apiKey,
                });
                model = openai(modelName);
                break;
            default:
                throw new Error(`Unsupported AI provider: ${aiProvider}, model: ${modelName}`);
        }
        if (!model) {
            throw new Error(`Failed to initialize model for provider: ${aiProvider}, model: ${modelName}`);
        }

        const { text } = await generateText({
            model: model,
            system: systemPrompt,
            prompt: userPrompt,
            // Add optional parameters if provided
            temperature: parameters.temperature || 0.7,
            top_p: parameters.top_p || 1,
            frequency_penalty: parameters.frequency_penalty || 0,
            presence_penalty: parameters.presence_penalty || 0,
            max_tokens: parameters.max_tokens
        });

        console.log('Summarized text success. Summary:', text);

        return text;
    } catch (error) {
        console.log('Error in summarizeText: ', error);
        // Provide more detailed error information for better debugging
        const errorInfo = {
            message: error.message,
            provider: data?.aiProvider,
            model: data?.modelName,
            stack: error.stack
        };
        throw errorInfo;
    }
}

// Handle async message and send response
function handleAsyncMessage(message, asyncOperation, sendResponse) {
    (async () => {
        try {
            const response = await asyncOperation();
            sendResponse({success: true, data: response});
        } catch (error) {
            console.error(`Message: ${message.type}. Error: ${error}`);
            sendResponse({success: false, error: error.toString()});
        }
    })();

    // indicate that sendResponse will be called later and hence keep the message channel open
    return true;
}

// Utility function for API calls with timeout
async function fetchWithTimeout(url, options = {}) {

    const {method = 'GET', headers = {}, body = null, timeout = 60_000} = options;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            method,
            headers,
            body,
            signal: controller.signal
        });
        clearTimeout(id);

        if (!response.ok) {
            const responseText = await response.text();
            const errorText = `API Error: HTTP error code: ${response.status}, URL: ${url} \nBody: ${responseText}`;
            console.error(errorText);
            throw new Error(errorText);
        }

        return await response.json();
    } catch (error) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout}ms: ${url}`);
        }
        throw error;
    }
}

// chrome.runtime.onInstalled.addListener(onInstalled);
