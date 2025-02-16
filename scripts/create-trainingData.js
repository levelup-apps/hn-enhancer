// noinspection SpellCheckingInspection

import Database from 'better-sqlite3';
import path, {dirname} from "path";
import {fileURLToPath} from "url";
import jsonlines from 'jsonlines';
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


// Initialize SQLite database
const db = new Database(path.join(__dirname, 'data/hn_posts.db'));

// Define the system message
const systemMessage = `You are an AI assistant specialized in summarizing Hacker News discussions. Analyze threaded comments with scores and reply counts. Focus on high-scoring and highly-replied comments to identify main themes and key insights.  Summarize in markdown format with these sections: Overview, Main Themes & Key Insights, [Theme Titles], Significant Viewpoints, Notable Side Discussions.  In 'Main Themes', use bullet points. When quoting comments, include the hierarchy path like '[1.2]' and attribute the author.`;

// Create a write stream for the JSONL file
const jsonlFile = path.join(__dirname, 'condensed-hn-companion-training-data-all.jsonl');
const writeStream = fs.createWriteStream(jsonlFile);
const writer = jsonlines.stringify();

// Pipe the writer to the write stream
writer.pipe(writeStream);


// Get all unprocessed posts
const posts = db.prepare('SELECT post_id, post_title, post_formatted_comments, llm_response_summary FROM posts_comments').all();

for (const post of posts) {
    try {

        const userQuery = `Summarize the following Hacker News discussion:\\n\\nThe title of the post and comments are separated by dashed lines.:\n-----\nPost Title:\n${post.post_title}\n-----\nComments:\n${post.post_formatted_comments}`;
        const expectedGeneratedText = post.llm_response_summary;

        // const jsonlObject = {
        //     system: systemMessage,
        //     messages: [{role: 'user', content: userQuery}, {role: 'assistant', content: expectedGeneratedText}]
        // };

        const jsonlObject = {
            "messages":
                [
                    {"role": "system", "content": systemMessage},
                    {"role": "user", "content": userQuery},
                    {"role": "assistant", "content": expectedGeneratedText}
                ]
        }

        writer.write(jsonlObject);

    } catch (e) {
        console.error(`Error processing post ID ${post.post_id}: ${e.message}`);
    }
}

// End the writer
writer.end(() => {
    console.log('JSONL file has been created successfully.');
});


// Close the database connection
db.close();