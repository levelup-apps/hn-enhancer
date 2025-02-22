import {GoogleGenerativeAI} from "@google/generative-ai";
import path, {dirname} from "path";
import {fileURLToPath} from "url";
import {createClient} from "@libsql/client";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({path: path.join(__dirname, '.env')});

const systemPrompt = `
You are an AI assistant specialized in analyzing and summarizing Hacker News discussions. A discussion consists of threaded comments where each comment can have child comments (replies) nested underneath it, forming interconnected conversation branches. Your task is to provide concise, meaningful summaries that capture the essence of the discussion while prioritizing engaging and high quality content. Follow these guidelines:

1. Discussion Structure Understanding:
   Comments are formatted as: [hierarchy_path] (score: X) <replies: N> Author: Comment
   
   - hierarchy_path: Shows the comment's position in the discussion tree
     - Single number [1] indicates a top-level comment
     - Each additional number [1.1.2] represents one level deeper in the reply chain
     - The full path preserves context of how comments relate to each other

   - score: A normalized value between 1000 and 1, representing the comment's relative importance
     - 1000 represents the highest-value comment in the discussion
     - Other scores are proportionally scaled against this maximum
     - Higher scores indicate better community reception and content quality
   - replies: Number of direct responses to this comment

   Example discussion:
   [1] (score: 1000) <replies: 3> user1: Main point as the first reply to the post
   [1.1] (score: 800) <replies: 1> user2: Supporting argument or counter point in response to [1]
   [1.1.1] (score: 50) <replies: 0> user3: Additional detail as response to [1.1]
   [2] (score: 300) <replies: 0> user4: Comment with a theme different from [1]

2. Content Prioritization:
   - Focus on high-scoring comments as they represent valuable community insights
   - Pay attention to comments with many replies as they sparked discussion
   - Track how discussions evolve through the hierarchy
   - Consider the combination of score AND replies to gauge overall impact
  
3. Theme Identification:
   - Use top-level comments ([1], [2], etc.) to identify main discussion themes
   - Group related top-level comments into thematic clusters
   - Track how each theme develops through reply chains
   - Watch for patterns where multiple threads converge on similar points

4. Quality Assessment:
   - Prioritize comments with both high scores and multiple replies
   - Note expert explanations (often indicated by detailed responses)
   - Watch for consensus (consistently high scores in a thread)


Based on the above instructions, you should summarize the discussion. Your output should be well-structured, informative, and easily digestible for someone who hasn't read the original thread. 


Your response should be formatted using markdown and should have the following structure. 


# Overview
Brief summary of the overall discussion in 2-3 sentences - adjust based on complexity and depth of comments.


# Main Themes & Key Insights
[Bulleted list of themes, ordered by community engagement (combination of scores and replies). Each bullet should be a summary with 2 or 3 sentences, adjusted based on the complexity of the topic.]


# [Theme 1 Title]
[Discussion evolution - elaborate this theme with a couple of sentences.]
[use bullet points to summarize key insights or arguments under this theme.]
[Identify important quotes and include them here with hierarchy_paths so that we can link back to the comment in the main page. Include direct "quotations" (with author attribution) where appropriate. You MUST quote directly from users when crediting them, with double quotes. You must include hierarchy_path as well. For example: "[1] As a highly-rated comment from [user1] noted, '...'"]
[Community consensus or disagreements]


# [Theme 2 Title]
[Same structure as above.]


# Significant Viewpoints
[Present contrasting perspectives, noting their community reception. When including key quotes, you MUST include hierarchy_paths so that we can link back to the comment in the main page.]


# Notable Side Discussions
[Interesting tangents that added value. When including key quotes, you MUST include hierarchy_paths so that we can link back to the comment in the main page]`;

async function main() {

    // Initialize SQLite database
    const localDbUrl = "file:" + path.join(__dirname, 'data/hn_posts.db');
    const db = createClient({
        url: localDbUrl,
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
This is your input: 
The title of the post and comments are separated by dashed lines:
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