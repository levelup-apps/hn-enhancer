(function () {

    // Listen for processed data from content script
    window.addEventListener('message', async function (event) {
        // reject all messages from other domains
        if (event.origin !== window.location.origin) {
            return;
        }

        // console.log('page-Script - Received message:', event.type, JSON.stringify(event.data));

        switch (event.data.type) {
            case 'HN_CHECK_AI_AVAILABLE':
                if ('ai' in self && 'summarizer' in self.ai) {
                    const available = (await self.ai.summarizer.capabilities()).available;

                    window.postMessage({
                        type: 'HN_CHECK_AI_AVAILABLE_RESPONSE',
                        data: {
                            available
                        }
                    });
                }
                break;
            case 'HN_AI_SUMMARIZE':
                const options = {
                    sharedContext: 'Summarize this discussion from Hacker News with comments. Show long content in bullet points..',
                    type: 'tl;dr',
                    format: 'plain-text',
                    length: 'medium',
                };
                if ('ai' in self && 'summarizer' in self.ai) {

                    const available = (await self.ai.summarizer.capabilities()).available;
                    if (available === 'no') {
                        window.postMessage({
                            type: 'HN_AI_SUMMARIZE_RESPONSE',
                            data: {
                                error: `Chrome Built-in AI is not available. AI Summarizer availability status: ${available}`
                            }
                        });
                        return;
                    }
                    const text = event.data.data.text;
                    const commentPathToIdMap = event.data.data.commentPathToIdMap;
                    const summarizer = await self.ai.summarizer.create(options);

                    try {
                        const summary = await summarizer.summarize(
                            text,
                            {context: 'This is a discussion thread in a tech community.'}
                        );
                        // console.log('Chrome Built-in AI summary:\n', summary);

                        window.postMessage({
                            type: 'HN_AI_SUMMARIZE_RESPONSE',
                            data: {
                                summary,
                                commentPathToIdMap
                            }
                        });
                    } catch (error) {
                        window.postMessage({
                            type: 'HN_AI_SUMMARIZE_RESPONSE',
                            data: {
                                error: `Summarization by Chrome Built-in failed. Error: ${available}`
                            }
                        });
                    }
                }
            break;
        }
    });
})();