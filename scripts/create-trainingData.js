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

// Initialize SQLite database
const localDbPath = "file:" + path.join(__dirname, 'data/hn_posts.db');
const db = createClient({
    url: localDbPath,
    syncUrl: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
    syncInterval: 30,
});

try {
    await db.sync();
} catch (error) {
    console.error('Error establishing database connection:', error);
    throw error;
}

// Define the system message
const systemMessage = `You are an AI assistant specialized in summarizing Hacker News discussions. Analyze threaded comments with scores and reply counts. Focus on high-scoring and highly-replied comments to identify main themes and key insights.  Summarize in markdown format with these sections: Overview, Main Themes & Key Insights, [Theme Titles], Significant Viewpoints, Notable Side Discussions.  In 'Main Themes', use bullet points. When quoting comments, include the hierarchy path like '[1.2]' and attribute the author.`;

// Create a write stream for the JSONL file
const outputFileName = 'hn-companion-training-data-test.jsonl';
const jsonlFile = path.join(__dirname, outputFileName);
const writeStream = fs.createWriteStream(jsonlFile);
const writer = jsonlines.stringify();

// Pipe the writer to the write stream
writer.pipe(writeStream);

// Get all unprocessed posts
const selectStmt = 'SELECT post_id, post_title, post_formatted_comments, llm_response_summary FROM posts_comments WHERE llm_processed = 1';
const result = await db.execute(selectStmt);
const posts = result.rows;

// Close the database connection since we have all the data we need
await db.close();

if (!posts || posts.length === 0) {
    console.log('No posts found that match query:', selectStmt);
    console.log('Exiting program - no training data will be generated.');
    process.exit(0);   // Exit with success code
}

console.log(`Creating training data with ${posts.length} posts...`);

for (const post of posts) {
    try {

        const userPrompt = `
Summarize the following Hacker News discussion according to the provided guidelines.
The discussion is formatted below with post title and comments separated by dashed lines:
-----
Post Title: 
${post.post_title}
-----
Comments: 
${post.post_formatted_comments}
-----`;
        const targetSummary = post.llm_response_summary;

        // const jsonlObject = {
        //     system: systemMessage,
        //     messages: [{role: 'user', content: userQuery}, {role: 'assistant', content: targetSummary}]
        // };

        const jsonlObject = {
            "messages":
                [
                    {"role": "system", "content": systemMessage},
                    {"role": "user", "content": userPrompt},
                    {"role": "assistant", "content": targetSummary}
                ]
        }

        writer.write(jsonlObject);

    } catch (e) {
        console.error(`Error processing post ID ${post.post_id}: ${e.message}`);
    }
}

// End the writer
writer.end(() => {
    console.log(`Training data exported successfully to JSONL file: ${outputFileName}`);
});