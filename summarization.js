class Summarization {
    constructor() {
        this.isAiAvailable = HNEnhancer.AI_AVAILABLE.NO;
    }

    initSummarizationAI() {
        function parseAvailable(available) {
            switch (available) {
                case 'readily':
                    return HNEnhancer.AI_AVAILABLE.YES;
                case 'no':
                    return HNEnhancer.AI_AVAILABLE.NO;
                case 'after-download':
                    return HNEnhancer.AI_AVAILABLE.AFTER_DOWNLOAD;
            }
            return HNEnhancer.AI_AVAILABLE.NO;
        }

        // 1. Inject the script into the webpage's context
        const pageScript = document.createElement('script');
        pageScript.src = chrome.runtime.getURL('page-script.js');
        (document.head || document.documentElement).appendChild(pageScript);

        pageScript.onload = () => {
            window.postMessage({
                type: 'HN_CHECK_AI_AVAILABLE',
                data: {}
            });
        }

        // 2. Listen for messages from the webpage
        window.addEventListener('message', function (event) {
            // reject all messages from other domains
            if (event.origin !== window.location.origin) {
                return;
            }

            // console.log('content.js - Received message:', event.type, JSON.stringify(event.data));

            // Handle different message types
            switch (event.data.type) {
                case 'HN_CHECK_AI_AVAILABLE_RESPONSE':
                    const available = event.data.data.available;

                    // TODO: Find a better way to set the HNEnhancer instance
                    document.hnEnhancer.isAiAvailable = parseAvailable(available);
                    console.log('HN_CHECK_AI_AVAILABLE_RESPONSE', document.hnEnhancer.isAiAvailable);
                    break;
                case 'HN_CHECK_AI_READY':
                    break;
                case 'HN_AI_SUMMARIZE_RESPONSE':
                    const summary = event.data.data.summary;
                    document.hnEnhancer.updateSummaryText(summary);
                    break;
            }
        });
    }

    summarizeTextWithAI(text) {
        chrome.storage.sync.get('settings').then(data => {
            const providerSelection = data.settings?.providerSelection;
            const model = data.settings?.[providerSelection]?.model;
            console.log(`Summarizing text with AI: providerSelection: ${providerSelection} model: ${model}`);

            switch (providerSelection) {
                case 'chrome-ai':
                    window.postMessage({
                        type: 'HN_AI_SUMMARIZE',
                        data: { text }
                    });
                    break;

                case 'openai':
                    const apiKey = data.settings?.[providerSelection]?.apiKey;
                    this.summarizeUsingOpenAI(text, model, apiKey);
                    break;

                case 'ollama':
                    this.summarizeUsingOlama(text, model);
                    break;
            }
        }).catch(error => {
            console.error('Error fetching settings:', error);
        });
    }

    summarizeUsingOpenAI(text, model, apiKey) {
        // Validate required parameters
        if (!text || !model || !apiKey) {
            console.error('Missing required parameters for OpenAI summarization');
            this.updateSummaryText('Error: Missing API configuration');
            return;
        }

        // Set up the API request
        const endpoint = 'https://api.openai.com/v1/chat/completions';

        // Create the system message for better summarization
        const systemMessage = {
            role: "system",
            content: "You are a precise summarizer. Create concise, accurate summaries that capture the main points while preserving key details. Focus on clarity and brevity."
        };

        // Create the user message with the text to summarize
        const userMessage = {
            role: "user",
            content: `Please summarize the following text concisely: ${text}`
        };

        // Prepare the request payload
        const payload = {
            model: model,
            messages: [systemMessage, userMessage],
            temperature: 0.3, // Lower temperature for more focused output
            max_tokens: 150,  // Limit response length for concise summaries
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0
        };

        // Make the API request using Promise chains
        fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        }).then(response => {
            if (!response.ok) {
                return response.json().then(errorData => {
                    throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
                });
            }
            return response.json();
        }).then(data => {
            const summary = data.choices[0]?.message?.content;

            if (!summary) {
                throw new Error('No summary generated from API response');
            }

            // Update the summary panel with the generated summary
            this.updateSummaryText(summary);
        }).catch(error => {
            console.error('Error in OpenAI summarization:', error);

            // Update the summary panel with an error message
            let errorMessage = 'Error generating summary. ';
            if (error.message.includes('API key')) {
                errorMessage += 'Please check your API key configuration.';
            } else if (error.message.includes('429')) {
                errorMessage += 'Rate limit exceeded. Please try again later.';
            } else {
                errorMessage += 'Please try again later.';
            }

            this.updateSummaryText(errorMessage);
        });
    }

    summarizeUsingOlama(text, model) {
        // Validate required parameters
        if (!text || !model) {
            console.error('Missing required parameters for Ollama summarization');
            this.updateSummaryText('Error: Missing API configuration');
            return;
        }

        // Set up the API request
        const endpoint = 'http://localhost:11434/api/generate';

        // Create the system message for better summarization
        const systemMessage = "You are a precise summarizer. Create concise, accurate summaries that capture the main points while preserving key details. Focus on clarity and brevity.";

        // Create the user message with the text to summarize
        const userMessage = `Please summarize the following text concisely: ${text}`;

        // Prepare the request payload
        const payload = {
            model: model,
            system: systemMessage,
            prompt: userMessage,
            stream: false
        };

        // Make the API request using Promise chains
        fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        }).then(response => {
            if (!response.ok) {
                return response.json().then(errorData => {
                    throw new Error(`Ollama API error: ${errorData.error?.message || 'Unknown error'}`);
                });
            }
            return response.json();
        }).then(data => {
            const summary = data.response;

            if (!summary) {
                throw new Error('No summary generated from API response');
            }

            // Update the summary panel with the generated summary
            this.updateSummaryText(summary);
        }).catch(error => {
            console.error('Error in Ollama summarization:', error);

            // Update the summary panel with an error message
            let errorMessage = 'Error generating summary. ' + error.message;
            this.updateSummaryText(errorMessage);
        });
    }

    updateSummaryText(text) {
        const summaryTextElement = document.querySelector('.summary-text');
        summaryTextElement.innerHTML = text;
    }
}

export { Summarization };
