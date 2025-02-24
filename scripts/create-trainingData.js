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

// Define the system prompt
const systemPrompt = `You are an AI assistant specialized in summarizing Hacker News discussions. Analyze threaded comments with scores and reply counts. 
Focus on high-scoring and highly-replied comments to identify main themes and key insights.  
Summarize in markdown format with these sections: Overview, Main Themes & Key Insights, [Theme Titles], Key Perspectives, Notable Side Discussions.  
In 'Main Themes', use bullet points. When quoting comments, include the hierarchy path like '[1.2]' and attribute the author.`;

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

// Get all unprocessed posts
// const selectStmt = `
// SELECT post_id, post_title, post_formatted_comments, llm_response_summary
// FROM posts_comments WHERE llm_processed = 1 AND llm_response_input_token_count < 10000
// `;

const selectStmt = `
SELECT post_id, post_title, post_formatted_comments, llm_response_summary
FROM posts_comments WHERE llm_processed = 1 AND llm_response_summary NOT NULL
                      AND llm_response_input_token_count < 4000
`;

const result = await db.execute(selectStmt);
const posts = result.rows;

// Close the database connection since we have all the data we need
await db.close();

if (!posts || posts.length === 0) {
    console.log('No posts found that match query:', selectStmt);
    console.log('Exiting program - no training data will be generated.');
    process.exit(0);   // Exit with success code
}

// Create a write stream for the JSONL file
const outputFileName = `hn-companion-training-data-4K-input-token.jsonl`;

const jsonlFile = path.join(__dirname, outputFileName);
const writeStream = fs.createWriteStream(jsonlFile);
const writer = jsonlines.stringify();

// Pipe the writer to the write stream
writer.pipe(writeStream);

console.log(`Creating training data with ${posts.length} posts...`);

let successCount = 0;
let errorCount = 0;

for (const post of posts) {

    // if any of the required fields (title, formatted comments or summar) are missing, skip this post
    if(!post.post_title || post.post_title.trim().length === 0 ||
        !post.post_formatted_comments || post.post_formatted_comments.trim().length === 0 ||
        !post.llm_response_summary || post.llm_response_summary.trim().length === 0
    ) {
        console.log(`Skipping post ID ${post.post_id} due to missing data. Title: ${post.post_title}, Comments length: ${post.post_formatted_comments?.length ?? 0}, Summary: ${post.llm_response_summary?.length ?? 0}`);
        continue;
    }

    console.log(`Processing post ${post.post_id}...`);

    // Create the user prompt by replacing the placeholders with the actual post title and comments
    const userPrompt = userPromptTemplate
        .replace(/{{postTitle}}/g, post.post_title || '')
        .replace(/{{postComments}}/g, post.post_formatted_comments || '');

    const targetSummary = post.llm_response_summary || '';

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
        successCount++;
    } catch (e) {
        console.error(`...Error processing post ID ${post.post_id}: ${e.message}`);
        errorCount++;
    }
}

// End the writer
writer.end(() => {
    console.log(`\nSuccessfully processed ${successCount}/${posts.length} posts. Encountered errors with ${errorCount} posts. Success rate: ${100 * successCount / posts.length}%`);
    console.log(`Training data exported to JSONL file: ${outputFileName}`);
});