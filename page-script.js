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
                    sharedContext: 'This is a discussion comment from Hacker News.',
                    type: 'tl;dr',
                    format: 'plain-text',
                    length: 'medium',
                };
                const summarizer = await self.ai.summarizer.create(options);
                const summary = await summarizer.summarize(event.data.data.text, {
                    context: 'This text is a comment for a tech-savvy audience.',
                });
                // console.log(summary);

                window.postMessage({
                    type: 'HN_AI_SUMMARIZE_RESPONSE',
                    data: {
                        summary
                    }
                })


                break;
        }
    });
})();