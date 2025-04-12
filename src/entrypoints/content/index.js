import './styles.css';

import HNEnhancer from './hnenhancer.js';

export default defineContentScript({
    matches: ['https://news.ycombinator.com/*'],

    main(ctx) {
        // Executed when content script is loaded, can be async
        console.log('HN Content script loaded');

        // Initialize the HNEnhancer. Note that we are loading this content script with the default run_at of 'document_idle'.
        // So this script is injected only after the DOM is loaded and all other scripts have finished executing.
        // This guarantees that the DOM of the main HN page is loaded by the time this script runs.
        document.hnEnhancer = new HNEnhancer();
    }
});