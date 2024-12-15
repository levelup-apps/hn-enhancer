(function () {
    // Example: Send comments data to content script
    // const comments = document.querySelectorAll('.comment');
    // window.postMessage({
    //     type: 'HN_GET_COMMENTS',
    //     comments: Array.from(comments).map(c => c.textContent)
    // }, '*');

    // Listen for processed data from content script
    window.addEventListener('message', async function (event) {
        // reject all messages from other domains
        if (event.origin !== window.location.origin) {
            return;
        }

        console.log('pageScript - Received message:', JSON.stringify(event));

        if (event.data.type === 'HN_PROCESSED_COMMENTS') {
            // console.log('Received processed comments:', event.data.data);
            // Update the webpage with processed data
        } else if (event.data.type === 'HN_CHECK_AI_AVAILABLE') {
            if ('ai' in self && 'summarizer' in self.ai) {
                let available = false;
                // The Summarizer API is supported.
                available = (await self.ai.summarizer.capabilities()).available;
                console.log(available);
            }

        }
    });
})();