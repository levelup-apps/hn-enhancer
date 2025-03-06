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

const longSystemMessage = `
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

// Define the system message
const shortSystemMessage = `You are HackerNewsCompanion, an AI assistant specialized in analyzing and summarizing Hacker News discussions.
Your task is to provide concise, meaningful summaries that capture the essence of the discussion while prioritizing high quality content. 
Focus on high-scoring and highly-replied comments, while deprioritizing downvoted comments (EXCLUDE comments with more than 4 downvotes), to identify main themes and key insights. 
Summarize in markdown format with these sections: Overview, Main Themes & Key Insights, [Theme Titles], Significant Viewpoints, Notable Side Discussions.  
In 'Main Themes', use bullet points. When quoting comments, include the hierarchy path and attribute the author, example '[1.2] (user1).'`;

// Create a write stream for the JSONL file
const jsonlFile = path.join(__dirname, 'mixed-prompt-training-data.jsonl');
const writeStream = fs.createWriteStream(jsonlFile);
const writer = jsonlines.stringify();

// Pipe the writer to the write stream
writer.pipe(writeStream);

let expandedSystemPromptCount = 0;
let condensedSystemPromptCount = 0;
// For the first set, use the expanded system message
let result = await db.execute(`SELECT post_id,
                               post_title,
                               post_formatted_comments,
                               llm_response_summary
                        FROM posts_comments
                        WHERE llm_processed = 1
                          and llm_response_input_token_count < 50000
                        order by post_id desc
                        limit 5000;`);

let posts = result.rows;

for (const post of posts) {
    try {

        const userQuery = `Provide a concise and insightful summary of the following Hacker News discussion, as per the guidelines you've been given. 
Comments are formatted as: [hierarchy_path] (score: X) <replies: Y> {downvotes: Z} Author: Comment.
The post title and comments are separated by three dashed lines.
---
Post Title:
${post.post_title}
---
Comments:
${post.post_formatted_comments}
---`;
        const expectedGeneratedText = post.llm_response_summary;

        const jsonlObject = {
            "messages":
                [
                    {"role": "system", "content": longSystemMessage},
                    {"role": "user", "content": userQuery},
                    {"role": "assistant", "content": expectedGeneratedText}
                ],
            "metadata": {
                "post_id": post.post_id.toString(),
                "prompt_type": "long"
            }
        }
        writer.write(jsonlObject);
    } catch (e) {
        console.error(`Error processing post ID ${post.post_id}: ${e.message}`);
    }
    expandedSystemPromptCount++;
    console.log('Processed post ID:', post.post_id, post.post_title);
}

// For the second set, use both the expanded system message and the system message
result = await db.execute(`SELECT post_id,
                           post_title,
                           post_formatted_comments,
                           llm_response_summary
                    FROM posts_comments
                    WHERE llm_processed = 1
                      and llm_response_input_token_count < 50000
                    order by post_id desc
                    limit 2000 offset 5000;`);

posts = result.rows;

let index = 0;
for (const post of posts) {
    try {
        index++;

        const userQuery = `Summarize the following Hacker News discussion:\\n\\nThe title of the post and comments are separated by dashed lines.:\n-----\nPost Title:\n${post.post_title}\n-----\nComments:\n${post.post_formatted_comments}`;
        const expectedGeneratedText = post.llm_response_summary;

        let systemPromptType = "short";
        let sysPrompt = shortSystemMessage;
        if (index % 5 === 0) {
            expandedSystemPromptCount++;
            sysPrompt = longSystemMessage;
            systemPromptType = "long";
        }
        else {
            condensedSystemPromptCount++;
        }
        const jsonlObject = {
            "messages":
                [
                    {"role": "system", "content": sysPrompt},
                    {"role": "user", "content": userQuery},
                    {"role": "assistant", "content": expectedGeneratedText}
                ],
            "metadata": {
                "post_id": post.post_id.toString(),
                "prompt_type": systemPromptType
            }
        }
        writer.write(jsonlObject);

    } catch (e) {
        console.error(`Error processing post ID ${post.post_id}: ${e.message}`);
    }
    console.log('Processed post ID:', post.post_id, post.post_title);
}

// End the writer
writer.end(() => {
    console.log('JSONL file has been created successfully.');
});

console.log('Expanded system message prompts:', expandedSystemPromptCount);
console.log('Condensed system message prompts:', condensedSystemPromptCount);
console.log('Total prompts:', expandedSystemPromptCount + condensedSystemPromptCount);

// Close the database connection
db.close();