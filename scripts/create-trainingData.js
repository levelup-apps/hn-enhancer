// noinspection SpellCheckingInspection

import path, {dirname} from "path";
import {fileURLToPath} from "url";
import jsonlines from 'jsonlines';
import fs from "fs";
import dotenv from "dotenv";
import {createClient} from "@libsql/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env in the current folder
dotenv.config({path: path.join(__dirname, '.env')});

let db;
try {
    // Initialize SQLite database connection
    const localDbPath = "file:" + path.join(__dirname, 'data/hn_posts.db');

    // Use the embedded replica version of Turso to connect to the database.
    //  Doing this will incur sync cost in Turso. So use it ONLY if you want to sync local copy with remote copy.
    // db = createClient({
    //     url: localDbPath,
    //     syncUrl: process.env.TURSO_DATABASE_URL,
    //     authToken: process.env.TURSO_AUTH_TOKEN
    // });
    // await db.sync();

    // Use the local-only version of Turso to connect to the database. This will prevent syncing with the cloud.
    db = createClient({
        url: localDbPath
    });

} catch (error) {
    console.error('Error establishing database connection:', error);
    throw error;
}

// Define the system prompt - concise version
const systemPrompt_concise = `You are an AI assistant specialized in summarizing Hacker News discussions. Analyze threaded comments with scores and reply counts. 
Focus on high-scoring and highly-replied comments to identify main themes and key insights.  
Summarize in markdown format with these sections: Overview, Main Themes & Key Insights, [Theme Titles], Key Perspectives, Notable Side Discussions.  
In 'Main Themes', use bullet points. When quoting comments, include the hierarchy path like '[1.2]' and attribute the author.`;

// Define the system prompt - detailed version
const systemPrompt_detailed = `
You are an AI assistant specialized in analyzing and summarizing Hacker News discussions. 
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
[Interesting tangents that added value. When including key quotes, you MUST include hierarchy_paths and author, so that we can link back to the comment in the main page]`;

const userPromptTemplate = `Provide a concise and insightful summary of the following Hacker News discussion, as per the guidelines you've been given. 
The goal is to help someone quickly grasp the main discussion points and key perspectives without reading all comments.
Please focus on extracting the main themes, significant viewpoints, and high-quality contributions.
The post title and comments are separated by three dashed lines:
---
Post Title:
{{postTitle}}
---
Comments:
{{postComments}}
---`;

// Let's get the data from the database. There are two options to consider:
// 1. Get all posts with input token count less than 10000
// 2. Get the posts as n buckets, where each bucket has a different range of input token counts


// Option 1 of 2: get all summarized posts with input token count less than 10000
// const selectStmt = `
// SELECT post_id, post_title, post_formatted_comments, llm_response_summary
// FROM posts_comments WHERE llm_processed = 1 AND llm_response_input_token_count < 10000
// `;

// Execute the query and get the posts. Close the database connection after that.
// const result = await db.execute(selectStmt);
// const posts = result.rows;
// await db.close();

// Option 2 of 2: get the posts as n buckets, where each bucket has a different range of input token counts
const queryTemplate = (range, limit) => `
    WITH selected_posts AS (
        SELECT post_id, post_title, post_formatted_comments, llm_response_summary, llm_response_input_token_count, llm_response_total_token_count
        FROM posts_comments
        WHERE llm_processed = 1
          AND llm_response_summary IS NOT NULL
          AND llm_response_input_token_count ${range}
        LIMIT ${limit}
    )
    SELECT
        (SELECT COUNT(*) FROM selected_posts) AS total_selected_posts,
        (SELECT SUM(llm_response_input_token_count) FROM selected_posts) AS total_input_tokens,
        post_id,
        post_title,
        post_formatted_comments,
        llm_response_summary,
        llm_response_input_token_count
    FROM selected_posts;
`;

// Data distribution as of 25 Feb 2025:
// Range,    Input Tokens, Output Tokens, Total Tokens, Limit, Total Posts, Percentage
// < 4000,      "1,465,277", "464,654",   "1,929,931",  500, 14532,     3.44%
// 4001-8000,   "8,803,326", "1,905,436", "10,708,762",1500, 14532,     10.32%
// 8001-12000,  "9,850,464", "1,437,437", "11,287,901",1000, 14532,     6.88%
// 12001-14000, "5,192,988", "599,843",   "5,792,831",  400, 14532,     2.75%
// 14001-32000, "2,085,649", "155,686",   "2,241,335",  100, 14532,     0.69%
// Total,       "27,397,704","4,563,056", "31,960,760",3500, 14532,     24.08%
async function executeAllQueries() {
    const bucketRanges = [
        { range: '< 4000', limit: 500 },
        { range: 'BETWEEN 4001 AND 8000', limit: 1500 },
        { range: 'BETWEEN 8001 AND 12000', limit: 1000 },
        { range: 'BETWEEN 12001 AND 14000', limit: 400 },
        { range: 'BETWEEN 14001 AND 32000', limit: 100 }
    ];

    const results = {};

    for (const [index, bucketRange] of bucketRanges.entries()) {
        const bucketName = `bucket_${index + 1}`;
        const query = queryTemplate(bucketRange.range, bucketRange.limit);

        try {
            const result = await db.execute(query);
            results[bucketName] = result.rows;
        } catch (error) {
            console.error(`Error executing query for bucket ${bucketName}: `, error);
            results[bucketName] = [];
        }
    }

    return results;
}

// Run the queries and get the results. Close the database connection after that.
const results = await executeAllQueries();
const postBuckets = Object.entries(results);
console.log(`\nRetrieved ${postBuckets.length} buckets of posts from the database\n`);
await db.close();

console.log(`Selected ${postBuckets.length} buckets of posts to process...`);
postBuckets.forEach(([bucketName, posts]) => {
    const inputTokens = `${posts[0].total_input_tokens.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    console.log(`...Bucket: ${bucketName}, Posts: ${posts.length}. Total input tokens: ${inputTokens}`);
});
console.log();

// Choose the system prompt to use - deailed or concise
const SYSTEM_PROMPT = {
    DETAILED: 1,
    CONCISE: 2,
}
const systemPromptChoice = SYSTEM_PROMPT.DETAILED;
// const systemPromptChoice = SYSTEM_PROMPT.CONCISE;

const systemPrompt = (systemPromptChoice === SYSTEM_PROMPT.DETAILED) ? systemPrompt_detailed : systemPrompt_concise;

const outputFileName = `hnft-trg-data-32M_sys-hybrid.jsonl`;

// Create a write stream for the JSONL file
const jsonlFile = path.join(__dirname, outputFileName);
const writeStream = fs.createWriteStream(jsonlFile);
const writer = jsonlines.stringify();

// Pipe the writer to the write stream
writer.pipe(writeStream);

// Prepare the template for fine-tuning. Different providers may require different formats.
const FINETUNE_TEMPLATES = {
    CHAT: JSON.stringify({
        "messages": [
            {"role": "system", "content": "{{systemPrompt}}"},
            {"role": "user", "content": "{{userPrompt}}"},
            {"role": "assistant", "content": "{{targetSummary}}"}
        ]
    }),
    ALPACA: JSON.stringify({
        "instruction": "{{systemPrompt}}",
        "input": "{{userPrompt}}",
        "output": "{{targetSummary}}"
    }),
    CHAT_OLD: JSON.stringify({
        "prompt": "{{systemPrompt}}\n\nUser: {{userPrompt}}\n\nAssistant: {{targetSummary}}",
        "completion": "{{targetSummary}}"
    }),
};

const PROVIDER = {
    FINETUNE_DB: { id: 1, name: 'FineTune DB', template: FINETUNE_TEMPLATES.CHAT},
    OPEN_PIPE: { id: 1, name: 'OpenPipe', template: FINETUNE_TEMPLATES.CHAT},
    LIGHTNING_AI: { id: 1, name: 'Lighting AI', template: FINETUNE_TEMPLATES.ALPACA},
};

const fineTuneProvider = PROVIDER.OPEN_PIPE;

const finetuneTemplate = JSON.parse(fineTuneProvider.template);

// Track the total posts and input tokens across all buckets
let totalInputTokensProcessed = 0;
let totalInputTokensExpected = 0;

// Track the success and error counts
let totalPostsProcessed = 0;
let totalPostsExpected = 0;

let errorCount = 0;

for (const [bucketName, posts] of postBuckets) {

    const bucketPostsExpected = posts[0].total_selected_posts;
    const bucketInputTokensExpected = posts[0].total_input_tokens;

    console.log(`Processing ${bucketName} with ${posts?.length} posts (${posts[0].total_input_tokens.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} input tokens)...`);

    let bucketPostsProcessed = 0;
    let bucketInputTokensProcessed = 0;

    // Iterate through each post in the bucket
    for (const post of posts) {

        // if any of the required fields (title, formatted comments or summar) are missing, skip this post
        if(!post.post_title || post.post_title.trim().length === 0 ||
            !post.post_formatted_comments || post.post_formatted_comments.trim().length === 0 ||
            !post.llm_response_summary || post.llm_response_summary.trim().length === 0
        ) {
            console.log(`Skipping post ID ${post.post_id} due to missing data. Title: ${post.post_title}, Comments length: ${post.post_formatted_comments?.length ?? 0}, Summary: ${post.llm_response_summary?.length ?? 0}`);
            continue;
        }

        // Create the user prompt by replacing the placeholders with the actual post title and comments
        const userPrompt = userPromptTemplate
            .replace(/{{postTitle}}/g, post.post_title || '')
            .replace(/{{postComments}}/g, post.post_formatted_comments || '');

        const targetSummary = post.llm_response_summary || '';

        // Replace the placeholers in the template using JSON object so that the encoding is consistent
        finetuneTemplate.messages.forEach(message => {
            switch (message.role) {
                case "system":
                    message.content = systemPrompt;
                    break;
                case "user":
                    message.content = userPrompt;
                    break;
                case "assistant":
                    message.content = targetSummary;
                    break;
                default:
                    console.warn(`Unexpected message role: ${message.role}`);
            }
        });

        // Write the JSONL object to the file
        const jsonlObject = finetuneTemplate;

        try {
            writer.write(jsonlObject);

            bucketPostsProcessed++;
            bucketInputTokensProcessed += post.llm_response_input_token_count;
        } catch (e) {
            console.error(`...Error processing post ID ${post.post_id}: ${e.message}`);
            errorCount++;
        }
    }

    console.log(`  Done! Processed posts: ${bucketPostsProcessed} of ${bucketPostsExpected}, ` +
                `Input tokens : ${bucketInputTokensProcessed.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} of ` +
                `${bucketInputTokensExpected.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`);

    totalPostsProcessed += bucketPostsProcessed;
    totalInputTokensProcessed += bucketInputTokensProcessed;

    totalPostsExpected += bucketPostsExpected;
    totalInputTokensExpected += bucketInputTokensExpected;
}

// End the writer
writer.end(() => {
    console.log(`\nAll done! Total processed: ${totalPostsProcessed} of ${totalPostsExpected} posts. ` +
                `Input tokens: ${totalInputTokensProcessed.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}` +
                ` of ${totalInputTokensExpected.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} \n` +
                `  Errors: ${errorCount}. Success rate: ${100 * totalPostsProcessed / totalPostsProcessed}%`);
    console.log(`\nTraining data exported to JSONL file: ${outputFileName}`);
});