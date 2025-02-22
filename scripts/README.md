### Data processing pipeline
1. Run the `download-post-ids.js` script to download the post ID that we need to process. Right now, we are only processing the posts from the past /front page.
    - script is run with Date in YYYY-MM-DD format and number of days to look back as numeric argument.
    - Last run date is `2023-10-04`
2. Run the `download.js` script to download the posts and the comments in the formatted way.
3. Run the `generate-llm-summary.js` script to generate the summary of the comments using LLM.