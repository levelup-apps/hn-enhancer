self.addEventListener('install', (event) => {
    console.log('Service Worker installing.');
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activating.');
});

self.addEventListener('fetch', (event) => {
    // Handle fetch events if needed
});

self.addEventListener('message', (event) => {
    const { type, data } = event.data;

    switch (type) {
        case 'FETCH_USER_INFO':
            fetchUserInfo(data.username)
                .then(userInfo => {
                    event.ports[0].postMessage({ type: 'USER_INFO', data: userInfo });
                })
                .catch(error => {
                    event.ports[0].postMessage({ type: 'ERROR', data: error.message });
                });
            break;
        case 'SUMMARIZE_TEXT':
            summarizeTextWithAI(data.text, data.providerSelection, data.model, data.apiKey, data.commentPathToIdMap)
                .then(summary => {
                    event.ports[0].postMessage({ type: 'SUMMARY', data: summary });
                })
                .catch(error => {
                    event.ports[0].postMessage({ type: 'ERROR', data: error.message });
                });
            break;
        default:
            console.error('Unknown message type:', type);
    }
});

async function fetchUserInfo(username) {
    try {
        const response = await fetch(`https://hn.algolia.com/api/v1/users/${username}`, { cache: 'force-cache' });
        const userInfoResponse = await response.json();
        return {
            karma: userInfoResponse.karma || 'Not found',
            about: userInfoResponse.about || 'No about information'
        };
    } catch (error) {
        console.error('Error fetching user info:', error);
        throw error;
    }
}

async function summarizeTextWithAI(text, providerSelection, model, apiKey, commentPathToIdMap) {
    switch (providerSelection) {
        case 'chrome-ai':
            return summarizeUsingChromeAI(text);
        case 'openai':
            return summarizeUsingOpenAI(text, model, apiKey, commentPathToIdMap);
        case 'ollama':
            return summarizeUsingOllama(text, model, commentPathToIdMap);
        case 'none':
            return text;
        default:
            throw new Error('Invalid provider selection');
    }
}

async function summarizeUsingChromeAI(text) {
    const options = {
        sharedContext: 'This is a discussion comment from Hacker News.',
        type: 'tl;dr',
        format: 'plain-text',
        length: 'medium',
    };
    const summarizer = await self.ai.summarizer.create(options);
    const summary = await summarizer.summarize(text, {
        context: 'This text is a comment for a tech-savvy audience.',
    });
    return summary;
}

async function summarizeUsingOpenAI(text, model, apiKey, commentPathToIdMap) {
    const endpoint = 'https://api.openai.com/v1/chat/completions';
    const systemMessage = getSystemMessage();
    const userMessage = {
        role: "user",
        content: `Please summarize the comments for a post with the title '${getHNPostTitle()}'. \n Following are the formatted comments: \n ${text}`
    };
    const payload = {
        model: model,
        messages: [systemMessage, userMessage],
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const summary = data?.choices[0]?.message?.content;

    if (!summary) {
        throw new Error('No summary generated from API response');
    }

    return summary;
}

async function summarizeUsingOllama(text, model, commentPathToIdMap) {
    const endpoint = 'http://localhost:11434/api/generate';
    const systemMessage = "You are a precise summarizer. Create concise, accurate summaries that capture the main points while preserving key details. Focus on clarity and brevity.";
    const userMessage = `Please summarize the following text concisely: ${text}`;
    const payload = {
        model: model,
        system: systemMessage,
        prompt: userMessage,
        stream: false
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Ollama API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const summary = data.response;

    if (!summary) {
        throw new Error('No summary generated from API response');
    }

    return summary;
}

function getSystemMessage() {
    return `
You are a skilled discussion analyzer specializing in hierarchical conversation in Hacker News comments. 
Your task is to create a comprehensive summary that captures both the content and the structural flow of the discussion.

Input Format:
The conversation will be provided as text with path-based identifiers showing the hierarchical structure:
[path_id] Author: Message

Example:
[1] Author: Initial message
[1.1] Author2: First-level reply
[1.1.1] Author3: Second-level reply

Follow these guidelines to generate the summary:
- Pay special attention to path numbers when tracking reply relationships
- Identify if certain branches were more productive than others
- Track how ideas evolve and transform across branch boundaries
- Map how topics evolve within each branch
- Identify topic relationships between branches
- Note where conversation shifts occur

Respond in this format:

Summary
- Major Discussion Points
- Key takeaways across all branches

Thread Analysis:
- Primary Branches: [Number and brief description of main conversation branches]
- Interaction Patterns: [Notable patterns in how the discussion branched]
- Branch Effectiveness: [Specify Branch path]

[Repeat for other significant branches]

`;
}

function getHNPostTitle() {
    return 'Hacker News Post Title'; // Placeholder, replace with actual logic to get the post title
}
