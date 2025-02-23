import {GoogleGenerativeAI} from "@google/generative-ai";
import path, {dirname} from "path";
import {fileURLToPath} from "url";
import {createClient} from "@libsql/client";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({path: path.join(__dirname, '.env')});

const systemPrompt = `
You are an AI assistant specialized in analyzing and summarizing Hacker News discussions. Your goal is to help users quickly understand the key discussions and insights from Hacker News threads without having to read through lengthy comment sections. A discussion consists of threaded comments where each comment can have child comments (replies) nested underneath it, forming interconnected conversation branches. 
Your task is to provide concise, meaningful summaries that capture the essence of the discussion while prioritizing high quality content. Follow these guidelines:

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

const userPrompt = `
Provide a concise and insightful summary of the following Hacker News discussion, as per the guidelines you've been given. The goal is to help someone quickly grasp the main discussion points and key perspectives without reading all comments. Please focus on extracting the main themes, significant viewpoints, and high-quality contributions.
The post title and comments are separated by dashed lines:
-----
Post Title: 
${postTitle}
-----
Comments: 
${formattedComments}
-----`;

async function main() {

    // Initialize SQLite database
    const localDbPath = "file:" + path.join(__dirname, 'data/hn_posts.db');
    const db = createClient({
        url: localDbPath,
        syncUrl: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    try {
        await db.sync();
    } catch (error) {
        console.error('Error establishing database connection:', error);
        throw error;
    }

    try {

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.error("Please set the GEMINI_API_KEY environment variable.");
            process.exit(1);
        }

        // Initialize the Google Generative AI client
        const genAI = new GoogleGenerativeAI(apiKey);
        const modelName = "gemini-2.0-flash";
        // const modelName = "gemini-2.0-flash-lite-preview-02-05";

        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: systemPrompt
        });

        // configure the model parameters and start the chat session
        const generationConfig = {
            temperature: 1,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192,
            responseMimeType: "text/plain",
        };
        const chatSession = model.startChat({
            generationConfig,
            history: [],
        });

        // Get all unprocessed posts
        const selectStmt = 'SELECT post_id, post_title, post_total_comments, post_formatted_comments ' +
                           'FROM posts_comments WHERE llm_processed IS NULL OR llm_processed = 0';
        const result = await db.execute(selectStmt);
        const posts = result.rows;

        // const posts = db.prepare('SELECT post_id, post_title, post_total_comments, post_formatted_comments FROM posts_comments WHERE llm_processed IS NULL OR llm_processed = 0').all();
        if (!posts || posts.length === 0) {
            console.log('No posts to process and generate LLM summary. Exiting....');
            return;
        }

        let postIndex = 0;
        console.log(`Processing ${posts.length} posts...\n`);

        for (const post of posts) {
            try {
                const startTime = new Date();
                console.log(`[${postIndex + 1}/${posts.length}] Processing post ${post.post_id} with ${post.post_total_comments} comments...`);

                const postTitle = post.post_title;
                const formattedComments = post.post_formatted_comments;

                const userPrompt = `
Summarize the following Hacker News discussion according to the provided guidelines.
The discussion is formatted below with post title and comments separated by dashed lines:
-----
Post Title: 
${postTitle}
-----
Comments: 
${formattedComments}
-----`;

                console.log(`...Generating summary using LLM model: ${modelName}`);
                const result = await chatSession.sendMessage(userPrompt);

                if (!result || !result.response) {
                    throw new Error('No response from the model for post ' + post.post_id);
                }

                // Extract values from completion object
                const llmResponseSummary = result.response?.candidates[0]?.content?.parts[0]?.text;
                const inputTokenCount = result.response?.usageMetadata ? result.response?.usageMetadata?.promptTokenCount : 0;
                const outputTokenCount = result.response?.usageMetadata ? result.response?.usageMetadata?.candidatesTokenCount : 0;
                const totalTokenCount = result.response?.usageMetadata ? result.response?.usageMetadata?.totalTokenCount : 0;

                console.log(`...Summarized post ${post.post_id}. Usage: Input tokens: ${inputTokenCount}, Output tokens: ${outputTokenCount}, Total tokens: ${totalTokenCount}`);

                // Update the database with the LLM response
                try {
                    const updateStmt = `
                        UPDATE posts_comments
                        SET llm_response_summary            = ?,
                            llm_response_input_token_count  = ?,
                            llm_response_output_token_count = ?,
                            llm_response_total_token_count  = ?,
                            llm_model_name                  = ?,
                            llm_processed                   = true
                        WHERE post_id = ?
                    `;
                    await db.execute({
                        sql: updateStmt,
                        args: [llmResponseSummary, inputTokenCount, outputTokenCount, totalTokenCount,
                            modelName, post.post_id]
                    });
                    console.log(`...Updated post ${post.post_id} in database with LLM response summary.`);
                } catch (error) {
                    console.error('Error updating the post in database with LLM response:', error);
                    throw error;
                }

                const endTime = new Date();
                const totalTime = (endTime - startTime) / 1000; // in seconds
                console.log(`Processing Done. Total time taken: ${totalTime} seconds.`);

            } catch (error) {

                console.error(`Error processing post ${post.post_id}:`, error);

                // Sleep for 120 secs to avoid rate limiting (Gemini API has a rate limit of 15 requests per minute)
                console.log('Sleeping 120 seconds after error to avoid rate limiting ...');
                await new Promise(resolve => setTimeout(resolve, 120 * 1000));
            } finally {
                postIndex++;
                // Sleep for 20 secs to avoid rate limiting (Gemini API has a rate limit of 15 requests per minute)
                console.log('Sleeping 20 seconds to avoid rate limiting ...\n');
                await new Promise(resolve => setTimeout(resolve, 20 * 1000));
            }
        }
    } catch (error) {
        console.error('Error in main process:', error);
    } finally {
        await db.close();
    }
}

main().catch(console.error);