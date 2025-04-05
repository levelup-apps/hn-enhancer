// This script downloads a post from Hacker News and summarizes it using an LLM of your choice.
//  You can give a post id or post URL as input and the script will download the post and its comments.

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import {decode} from "html-entities";
import { parse }  from "node-html-parser";

dotenv.config({ path: path.join(__dirname, '.env') });

// Create output directory if it doesn't exist
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

async function fetchHNPostFromAPI(postId) {
    try {
        const url = `https://hn.algolia.com/api/v1/items/${postId}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }
        return response.json();
    } catch (error) {
        throw new Error(`Failed to fetch post from HN API for post ID ${postId}. Error: ${error.message}`);
    }
}

async function fetchHNPage(postId) {
    try {
        const url = `https://news.ycombinator.com/item?id=${postId}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
        }
        const responseText = await response.text();

        // if the post id is not found, the response will be "No such item.". If so, throw an error
        if (responseText === 'No such item.') {
            throw new Error(`Post ID ${postId} not found on HN.`);
        }

        return responseText;
    } catch (error) {
        throw new Error(`Failed to fetch HN page for post ID ${postId}: ${error.message}`);
    }
}

export function getDownvoteCount(commentTextDiv) {

    // Downvotes are represented by the color of the text. The color is a class name like 'c5a', 'c73', etc.
    const downvotePattern = /c[0-9a-f]{2}/;

    // Find the first class that matches the downvote pattern
    const downvoteClass = [...commentTextDiv.classList.values()]
        .find(className => downvotePattern.test(className.toLowerCase()))
        ?.toLowerCase();

    if (!downvoteClass) {
        return 0;
    }

    const downvoteMap = {
        'c00': 0,
        'c5a': 1,
        'c73': 2,
        'c82': 3,
        'c88': 4,
        'c9c': 5,
        'cae': 6,
        'cbe': 7,
        'cce': 8,
        'cdd': 9
    };
    return downvoteMap[downvoteClass] || 0;
}

async function getCommentsFromDOM(postHtml) {

    // Comments in the DOM are arranged according to their up votes. This gives us the position of the comment.
    //  We will also extract the downvotes and text of the comment (after sanitizing it).
    // Create a map to store comment positions, downvotes and the comment text.
    const commentsInDOM = new Map();

    const rootElement = parse(postHtml);

    // Step 1: collect all comments and their metadata
    const commentRows = rootElement.querySelectorAll('.comtr');

    let skippedComments = 0;
    commentRows.forEach((commentRow, index) => {

        // if comment is flagged, it will have the class "coll" (collapsed) or "noshow" (children of collapsed comments)
        // if the commText class is not found, the comment is deleted or not visible.
        // Check for these two conditions and skip it.
        const commentFlagged = commentRow.classList.contains('coll') || commentRow.classList.contains('noshow');
        const commentTextDiv = commentRow.querySelector('.commtext');
        if( commentFlagged || !commentTextDiv ) {
            // console.log(`...Skipping flagged comment at position ${index}. commentFlagged: ${commentFlagged}, commentTextDiv: ${commentTextDiv}`);
            skippedComments++;
            return;
        }

        // Step 2: Sanitize the comment text (remove unnecessary html tags, encodings)
        function sanitizeCommentText() {

            // Remove unwanted HTML elements from the clone
            [...commentTextDiv.querySelectorAll('a, code, pre')].forEach(element => element.remove());

            // Replace <p> tags with their text content
            commentTextDiv.querySelectorAll('p').forEach(p => {
                const text = p.textContent;
                p.replaceWith(text);
            });

            // Remove unnecessary new lines and decode HTML entities by decoding the HTML entities
            const sanitizedText = decode(commentTextDiv.innerHTML)
                .replace(/\n+/g, ' ');

            return sanitizedText;
        }
        const commentText = sanitizeCommentText();

        // Step 3: Get the down votes of the comment in order to calculate the score later

        const downvotes = getDownvoteCount(commentTextDiv);

        const commentId = commentRow.getAttribute('id');

        // Step 4: Add the position, text and downvotes of the comment to the map
        commentsInDOM.set(
            Number(commentId), {
                position: index,
                text: commentText,
                downvotes: downvotes,
            }
        );
    });

    console.log(`...Comments from DOM:: Total: ${commentRows.length}. Skipped (flagged): ${skippedComments}. Remaining: ${commentsInDOM.size}`);
    return commentsInDOM;
}

export function extractComments(commentsTree, commentsInDOM) {

    // Here, we merge the comments from the post hierarchy and DOM as follows:
    //  add the position of the comment in the DOM (according to the up votes)
    //  add the text and the down votes of the comment (also from the DOM)
    //  add the author and number of children as replies (from the comment tree)
    //  sort them based on the position in the DOM (according to the up votes)
    //  add the path of the comment (1.1, 1.2, 2.1 etc.) based on the position in the DOM
    //  add the score of the comment based on the position and down votes

    // Step 1: Flatten the comment tree to map with metadata, position and parent relationship
    //  This is a recursive function that traverses the comment tree and adds the metadata to the map
    let flatComments = new Map();

    let apiComments = 0;
    let skippedComments = 0;
    function flattenCommentTree(comment, parentId) {

        // Track the number of comments as we traverse the tree to find the comments from HN API.
        apiComments++;

        // If this is the story item (root of the tree), flatten its children, but do not add the story item to the map.
        if (comment.type === 'story') {
            if (comment.children && comment.children.length > 0) {
                comment.children.forEach(child => {
                    flattenCommentTree(child, comment.id);
                });
            }
            return;
        }

        // Set the values into the flat comments map - some properties come from the comment, some from the DOM comments map
        //  - id, author, replies: from the comment
        //  - position, text, down votes: from the DOM comments map
        //  - parentId from the caller of this method

        // Get the DOM comment corresponding to this comment from the commentsInDOM map
        const commentInDOM = commentsInDOM.get(comment.id);
        if(!commentInDOM) {
            // This comment is not found in the DOM comments because it was flagged or collapsed, skip it
            skippedComments++;
            return;
        }

        // Add comment to map along with its metadata including position, downvotes and parentId that are needed for scoring.
        flatComments.set(comment.id, {
            id: comment.id,  // Add the id in the comment object so that you can access later
            author: comment.author,
            replies: comment.children?.length || 0,
            position: commentInDOM.position,
            text: commentInDOM.text,
            downvotes: commentInDOM.downvotes,
            parentId: parentId,
        });

        // Process children of the current comment, pass the comment id as the parent id to the next iteration
        //  so that the parent-child relationship is retained, and we can use it to calculate the path later.
        if (comment.children && comment.children.length > 0) {
            comment.children.forEach(child => {
                flattenCommentTree(child, comment.id);
            });
        }
    }

    // Flatten the comment tree and collect comments as a map
    flattenCommentTree(commentsTree, null);

    // Log the comments so far, skip the top level comment (story) because it is not added to the map
    console.log(`...Comments from API:: Total: ${apiComments - 1}. Skipped: ${skippedComments}. Remaining: ${flatComments.size}`);

    // Step 2: Start building the map of enriched comments, start with the flat comments and sorting them by position.
    //  We have to do this BEFORE calculating the path because the path is based on the position of the comments.
    const mergedComments = new Map([...flatComments.entries()]
        .sort((a, b) => a[1].position - b[1].position));

    // Step 3: Calculate paths (1.1, 2.3 etc.) using the parentId and the sequence of comments
    //  This step must be done AFTER sorting the comments by position because the path is based on the position of the comments.
    let topLevelCounter = 1;

    function calculatePath(comment) {
        let path;
        if (comment.parentId === commentsTree.id) {
            // Top level comment (its parent is the root of the comment tree which is the story).
            //  The path is just a number like 1, 2, 3, etc.
            path = String(topLevelCounter++);
        } else {
            // Child comment at any level.
            //  The path is the parent's path + the position of the comment in the parent's children list.
            const parentPath = mergedComments.get(comment.parentId).path;

            // get all the children of this comment's parents - this is the list of siblings
            const siblings = [...mergedComments.values()]
                .filter(c => c.parentId === comment.parentId);

            // Find the position of this comment in the siblings list - this is the sequence number in the path
            const positionInParent = siblings
                .findIndex(c => c.id === comment.id) + 1;

            // Set the path as the parent's path + the position in the parent's children list
            path = `${parentPath}.${positionInParent}`;
        }
        return path;
    }

    // Step 4: Calculate the score for each comment based on its position and downvotes
    function calculateScore(comment, totalCommentCount) {
        // Example score calculation using downvotes
        const downvotes = comment.downvotes || 0;

        // Score is a number between 1000 and 0, and is calculated as follows:
        //   default_score = 1000 - (comment_position * 1000 / total_comment_count)
        //   penalty for down votes = default_score * # of downvotes

        const MAX_SCORE = 1000;
        const MAX_DOWNVOTES = 10;

        const defaultScore = Math.floor(MAX_SCORE - (comment.position * MAX_SCORE / totalCommentCount));
        const penaltyPerDownvote = defaultScore / MAX_DOWNVOTES;
        const penalty = penaltyPerDownvote * downvotes;

        const score = Math.floor(Math.max(defaultScore - penalty, 0));
        return score;
    }

    // Final step: Add the path and score for each comment as calculated above
    mergedComments.forEach(comment => {
        comment.path = calculatePath(comment);
        comment.score = calculateScore(comment, mergedComments.size);

        // Format the comment with path, score, replies, downvotes, author and text
        comment.formattedText =
            `[${comment.path}] (score: ${comment.score}) <replies: ${comment.replies}> {downvotes: ${comment.downvotes}} ` +
            `${comment.author}: ${comment.text}`;
    });

    return mergedComments;
}

async function downloadPostComments(postId) {

    try {
        console.log(`...Downloading comments from HN Algolia and merging it with the DOM page`);
        // Fetch both data sources in parallel to improve performance
        const [post, postHtml] = await Promise.all([
            fetchHNPostFromAPI(postId),
            fetchHNPage(postId)
        ]);

        const commentsInDOM = await getCommentsFromDOM(postHtml);

        // Merge the two data sets to structure the comments based on hierarchy, votes and position
        const postComments = extractComments(post, commentsInDOM);

        // Early return with structured data
        return {
            post,
            postComments
        };

    } catch (error) {
        console.error(`...Error downloading comments: ${error.message}`);
        // Re-throw the error to allow proper error handling upstream
        throw error;
    }
}

function createUserPrompt(post, comments) {

    let formattedComments = '';
    comments.forEach(comment => {
        formattedComments += comment.formattedText + '\n';
    });

    // Create the user prompt with the structured format
    const userPrompt = `Provide a concise and insightful summary of the following Hacker News discussion, as per the guidelines you've been given. 
The goal is to help someone quickly grasp the main discussion points and key perspectives without reading all comments.
Please focus on extracting the main themes, significant viewpoints, and high-quality contributions.
The post title and comments are separated by three dashed lines:
---
Post Title:
${post.title}
---
Comments:
${formattedComments}
---`;

    const userPromptFilePath = path.join(outputDir, `${post.id}-user-prompt.txt`);
    fs.writeFileSync(userPromptFilePath, userPrompt, 'utf8');
    console.log(`...Saved user prompt with ${comments.size} comments to ${userPromptFilePath}`);

    return { userPrompt, userPromptFilePath };
}

function getSystemPrompt() {
    return `
You are HackerNewsCompanion, an AI assistant specialized in analyzing and summarizing Hacker News discussions. 
Your goal is to help users quickly understand the key discussions and insights from Hacker News threads without having to read through lengthy comment sections. 
A discussion consists of threaded comments where each comment can have child comments (replies) nested underneath it, forming interconnected conversation branches. 
Your task is to provide concise, meaningful summaries that capture the essence of the discussion while prioritizing high quality content. 
Follow these guidelines:

1. Discussion Structure Understanding:
   Comments are formatted as: [hierarchy_path] (score: X) <replies: Y> {downvotes: Z} Author: Comment
   
   - hierarchy_path: Shows the comment's position in the discussion tree
     - Single number [1] indicates a top-level comment
     - Each additional number represents one level deeper in the reply chain. e.g., [1.2.1] is a reply to [1.2]
     - The full path preserves context of how comments relate to each other

   - score: A normalized value between 1000 and 1, representing the comment's relative importance
     - 1000 represents the highest-value comment in the discussion
     - Other scores are proportionally scaled against this maximum
     - Higher scores indicate more upvotes from the community and content quality
     
   - replies: Number of direct responses to this comment

   - downvotes: Number of downvotes the comment received
     - Exclude comments with high downvotes from the summary
     - DO NOT include comments that are have 4 or more downvotes
   
   Example discussion:
   [1] (score: 1000) <replies: 3> {downvotes: 0} user1: Main point as the first reply to the post
   [1.1] (score: 800) <replies: 1> {downvotes: 0} user2: Supporting argument or counter point in response to [1]
   [1.1.1] (score: 150) <replies: 0> {downvotes: 6} user3: Additional detail as response to [1.1], but should be excluded due to more than 4 downvotes
   [2] (score: 400) <replies: 1> {downvotes: 0} user4: Comment with a theme different from [1]
   [2.1] (score: 250) <replies: 0> {downvotes: 1} user2: Counter point to [2], by previous user2, but should have lower priority due to low score and 1 downvote
   [3] (score: 200) <replies: 0> {downvotes: 0} user5: Another top-level comment with a different perspective

2. Content Prioritization:
   - Focus on high-scoring comments as they represent valuable community insights
   - Pay attention to comments with many replies as they sparked discussion
   - Track how discussions evolve through the hierarchy
   - Consider the combination of score, downvotes AND replies to gauge overall importance, prioritizing insightful, well-reasoned, and informative content
  
3. Theme Identification:
   - Use top-level comments ([1], [2], etc.) to identify main discussion themes
   - Identify recurring themes across top-level comments 
   - Look for comments that address similar aspects of the main post or propose related ideas.
   - Group related top-level comments into thematic clusters
   - Track how each theme develops through reply chains

4. Quality Assessment:
    - Prioritize comments that exhibit a combination of high score, low downvotes, substantial replies, and depth of content
    - High scores indicate community agreement, downvotes indicate comments not aligned with Hacker News guidelines or community standards
    - Replies suggest engagement and discussion, and depth (often implied by longer or more detailed comments) can signal valuable insights or expertise
    - Actively identify and highlight expert explanations or in-depth analyses. These are often found in detailed responses, comments with high scores, or from users who demonstrate expertise on the topic

Based on the above instructions, you should summarize the discussion. Your output should be well-structured, informative, and easily digestible for someone who hasn't read the original thread. 

Your response should be formatted using markdown and should have the following structure. 

# Overview
Brief summary of the overall discussion in 2-3 sentences - adjust based on complexity and depth of comments.

# Main Themes & Key Insights
[Bulleted list of themes, ordered by community engagement (combination of scores and replies). Order themes based on the overall community engagement they generated. Each bullet should be a summary with 2 or 3 sentences, adjusted based on the complexity of the topic.]

# [Theme 1 title - from the first bullet above]
[Summarize key insights or arguments under this theme in a couple of sentences. Use bullet points.]
[Identify important quotes and include them here with hierarchy_paths so that we can link back to the comment in the main page. Include direct "quotations" (with author attribution) where appropriate. You MUST quote directly from users with double quotes. You MUST include hierarchy_path as well. Do NOT include comments with 4 or more downvotes. For example: 
- [1.1.1] (user3) noted, '...'
- [2.1] (user2) explained that '...'"
- [3] Perspective from (user5) added, "..."
- etc.

# [Theme 2 title - from the second bullet in the main themes section]
[Same structure as above.]

# [Theme 3 title and 4 title - if the discussion has more themes]

# Key Perspectives
[Present contrasting perspectives, noting their community reception. When including key quotes, you MUST include hierarchy_paths and author, so that we can link back to the comment in the main page.]
[Present these concisely and highlight any significant community reactions (agreement, disagreement, etc.)]
[Watch for community consensus or disagreements]

# Notable Side Discussions
[Interesting tangents that added value. When including key quotes, you MUST include hierarchy_paths and author, so that we can link back to the comment in the main page]
`;
}

function createCommentPathIdMapping(post, comments) {
    // Create an array of [path, id] pairs so that they are sorted by their position in the original collection.
    //  Then save the array directly to the JSON file
    const commentPathIdMapping = [];
    comments.forEach(comment => {
        commentPathIdMapping.push([comment.path, comment.id]);
    });

    const commentPathMapFilePath = path.join(outputDir, `${post.id}-comment-path-id-map.json`);
    fs.writeFileSync(commentPathMapFilePath, JSON.stringify(commentPathIdMapping, null, 2), 'utf8');
    console.log(`...Saved ${comments.size} comment paths map to ${commentPathMapFilePath}`);

    return { commentPathIdMapping, commentPathMapFilePath };
}

async function summarizeComments(model, endpoint, apiKey, userPrompt) {

    // Set up the API request

    // Create the system and user prompts for better summarization
    const systemPrompt = getSystemPrompt();

    // Anthropic API request - prepare the payload and headers
    // const messages = [{
    //     role: "user",
    //     content: userPrompt
    // }];
    //
    // // Prepare the request payload
    // const payload = {
    //     model: model,
    //     system: systemPrompt,
    //     messages: messages,
    //     max_tokens: 2048
    // };
    // const headers = {
    //     'Content-Type': 'application/json',
    //     'x-api-key': apiKey,
    //     'anthropic-version': '2023-06-01',
    //     'anthropic-dangerous-direct-browser-access': 'true' // this is required to resolve CORS issue
    // }

    // OpenAI API request - prepare the payload and headers
    const messages = [{
        role: "system",
        content: systemPrompt
    }, {
        role: "user",
        content: userPrompt
    }];

    // Prepare the request payload
    const payload = {
        model: model,
        messages: messages,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
    };

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    // Make the API request using background message
    let summary;
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        const responseJson = await response.json();
        if(!response.ok) {
            throw new Error(`API Error: ${responseJson.error.message}`);
        }

        // Anthropic response
        // if(!responseJson || !responseJson.content || responseJson.content.length === 0) {
        //     throw new Error(`Summary response data is empty. ${data}`);
        // }
        // summary = responseJson.content[0].text;

        // OpenAI response
        if(!responseJson || !responseJson.choices || responseJson.choices.length === 0) {
            throw new Error(`Summary response data is empty. ${data}`);
        }
        summary = responseJson?.choices[0]?.message?.content;

    } catch (error) {
        // Update the summary panel with an error message
        let errorMessage = `Error generating summary using model ${model}. `;
        if (error.message.includes('API key')) {
            errorMessage += 'Please check your API key configuration.';
        } else if (error.message.includes('429') ) {
            errorMessage += 'Rate limit exceeded. Please try again later.';
        } else if (error.message.includes('current quota')) {
            errorMessage += 'API quota exceeded. Please try again later.';  // OpenAI has a daily quota
        }
        else {
            errorMessage += error.message + ' Please try again later.';
        }
        console.error('Error in LLM summarization:', errorMessage);
    }

    if (!summary) {
        throw new Error(`No summary generated from API response. endpoint: ${endpoint}, model: ${model}`);
    }
    return summary;
}

function summarizePost(userPromptFilePath) {

    // replace with your LLM of choice

    // Placeholder for the summarization logic
    return 'This is a placeholder summary with path [1.1](auth_1) This is ok. And one more comment [2.1](auth_2) said something else. Some text.';
}

function resolveCommentLinks(post, summaryText, commentPathMapFilePath) {

    // Read the comment path to ID map from the JSON file. Read into a map for faster lookup.
    const pathEntriesJson = fs.readFileSync(commentPathMapFilePath, 'utf8');
    const pathEntries = JSON.parse(pathEntriesJson);

    const commentPathToIdMap = new Map(pathEntries);

    // Regular expression to match bracketed numbers with dots
    // Matches patterns like [1], [1.1], [1.1.2], etc.
    const pathRegex = /\[(\d+(?:\.\d+)*)]/g;

    // Replace each match with an HTML link
    return summaryText.replace(pathRegex, (match, path) => {
        const commentId = commentPathToIdMap.get(path);
        if (!commentId) {
            return match; // If no ID found, return original text
        }
        return `[comment #${commentId}](https://news.ycombinator.com/item?id=${post.id}#${commentId})`;
    });
}

// main function that processes posts from SQLite database
async function main() {
    try {
        // Get the post ID from command line arguments
        const postId = process.argv[2];

        // Check if a post ID was provided
        if (!postId) {
            console.error('Error: Post ID missing. Please provide a post id as a command line argument');
            console.error('Usage: node summarize-comments.js <postId>');
            process.exit(1);
        }
        console.log(`\nProcessing post ${postId}...\n`);

        console.log(`Step 1: Downloading post...`);
        const { post, postComments } = await downloadPostComments(postId);
        if(!post || !postComments) {
            console.error(`...Failed to download post ${postId}`);
            return;
        }
        console.log(`Downloaded post ${post.id} '${post.title}' (${postComments.size} comments)`);

        console.log(`\nStep 2: Creating user prompt and saving to file...`);
        const { userPrompt, userPromptFilePath } = createUserPrompt(post, postComments);

        console.log(`\nStep 3: Creating comment path-to-id map and saving to file...`);
        const { commentPathIdMapping, commentPathMapFilePath } = createCommentPathIdMapping(post, postComments);

        console.log(`...Post ${post.id} downloaded and saved to files:`);
        console.log(`   User prompt formatted (text file): ${userPromptFilePath}`);
        console.log(`   Comment path id map (json file):   ${commentPathMapFilePath}`);

        // Summarize the post using the formatted text

        // OpenRouter API key
        const apiKey = process.env.OPENROUTER_API_KEY;
        const input = {
            model: `meta-llama/llama-4-maverick`,
            // model: `meta-llama/llama-4-scout`,
            // model: `anthropic/claude-3.7-sonnet`,
            endpoint: `https://openrouter.ai/api/v1/chat/completions`,
            apiKey: apiKey,
        }

        // Anthropic API key
        // const apiKey = process.env.ANTHROPIC_API_KEY;
        // const input = {
        //     model: `claude-3-5-haiku-latest`,
        //     endpoint: `https://api.anthropic.com/v1/messages`,
        //     apiKey: `your_api_key`,
        // }

        // OpenAI API key
        // const apiKey = process.env.OPENAI_API_KEY;
        // const input = {
        //     model: `gpt-4`,
        //     endpoint: `https://api.openai.com/v1/chat/completions`,
        //     apiKey: apiKey,
        // }

        console.log(`\nStep 4: Summarizing post using model ${input.model}...`);
        const summary = await summarizeComments(input.model, input.endpoint, input.apiKey, userPrompt);
        console.log(`...Post summarized successfully`);
        console.log(`Summary: ${summary}`);

        // Resolve the comment path to id's in the summary text
        console.log(`\nStep 5: Resolving comment links in the summary...`);
        const resolvedSummary = resolveCommentLinks(post, summary, commentPathMapFilePath);

        // Save the resolved summary as MD file
        const summaryFilePath = userPromptFilePath.replace('-user-prompt.txt', '-summary.md');
        fs.writeFileSync(summaryFilePath, resolvedSummary, 'utf8');
        console.log(`...Saved post summary to ${summaryFilePath}`);

        console.log('\nPost summarized successfully');

    } catch (error) {
        console.error('ERROR in main:', error);
    }
}

// Only run the main function if this file is being run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error('Error in main:', error);
        process.exit(1);  // Exit with error code
    });
}