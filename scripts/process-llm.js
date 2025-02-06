import OpenAI from "openai";
import Database from 'better-sqlite3';
import path, {dirname} from "path";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const apiKey =  process.env.DEEPSEEK_API_KEY;
if(!apiKey) {
    console.error("Please set the DEEPSEEK_API_KEY environment variable.");
    process.exit(1);
}

// for backward compatibility, you can still use `https://api.deepseek.com/v1` as `baseURL`.
const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: apiKey
});

// Initialize SQLite database
const db = new Database(path.join(__dirname, 'data/hn_posts.db'));

const systemMessage = `
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
[Discussion evolution - elaborate this theme with a couple of sentences]
[Key quotes with hierarchy_paths so that we can link back to the comment in the main page. Include direct "quotations" (with author attribution) where appropriate. You MUST quote directly from users when crediting them, with double quotes. You must include hierarchy_path as well. For example: "[1] As a highly-rated comment from [user1] noted, '...'"]
[Community consensus or disagreements]


# [Theme 2 Title]
[Same structure as above.]


# Significant Viewpoints
[Present contrasting perspectives, noting their community reception. When including key quotes, you MUST include hierarchy_paths so that we can link back to the comment in the main page.]


# Notable Side Discussions
[Interesting tangents that added value. When including key quotes, you MUST include hierarchy_paths so that we can link back to the comment in the main page]`

function splitInputTextAtTokenLimit(text, tokenLimit) {
    // Approximate token count per character
    const TOKENS_PER_CHAR = 0.25;

    // If the text is short enough, return it as is
    if (text.length * TOKENS_PER_CHAR < tokenLimit) {
        return text;
    }

    console.log(`Input text is ${text.length} long. Splitting text at token limit of ${tokenLimit}...`);

    // Split the text into lines
    const lines = text.split('\n');
    let outputText = '';
    let currentTokenCount = 0;

    // Iterate through each line and accumulate until the token limit is reached
    for (const line of lines) {
        const lineTokenCount = line.length * TOKENS_PER_CHAR;
        if (currentTokenCount + lineTokenCount >= tokenLimit) {
            break;
        }
        outputText += line + '\n';
        currentTokenCount += lineTokenCount;
    }

    return outputText;
}


async function main() {
    try {

        const startTime = new Date();

        // Get all unprocessed posts
        const posts = db.prepare('SELECT post_id, post_title, post_formatted_comments FROM data_set WHERE deepseek_processed IS NULL OR deepseek_processed = 0').all();
        // const posts = db.prepare('SELECT post_id, post_title, post_formatted_comments FROM data_set WHERE post_id=42899879').all();

        for (const post of posts) {
            try {
                console.log(`Processing post ${post.post_id}...`);

                const postTitle = post.post_title;
                // DeepSeek model's maximum context length is 65,536 tokens.
                // System message is around 1,000 tokens.
                // Output markdown template is around 8,192 tokens.
                // We need to split the input text at around 55,000 tokens to stay within the limit.
                const formattedComments = splitInputTextAtTokenLimit(post.post_formatted_comments, 50_000);

                const userMessage = `
This is your input:
The title of the post and comments are separated by dashed lines.:
-----
Post Title: ${postTitle}
-----
Comments: ${formattedComments}
-----`;

                const completion = await openai.chat.completions.create({
                    messages: [
                        {role: "system", content: systemMessage},
                        {role: "user", content: userMessage}
                    ],
                    // max_tokens: 8192,
                    model: "deepseek-chat",
                });

                // Begin transaction
                const updateStmt = db.prepare(`
                    UPDATE data_set
                    SET deepseek_llm_response               = ?,
                        deepseek_response_prompt_tokens     = ?,
                        deepseek_response_completion_tokens = ?,
                        deepseek_response_total_tokens      = ?,
                        deepseek_response_cached_tokens     = ?,
                        deepseek_processed                  = true
                    WHERE post_id = ?
                `);

                // Extract values from completion object
                const llmResponse = completion.choices[0].message.content;
                const promptTokens = completion.usage.prompt_tokens;
                const completionTokens = completion.usage.completion_tokens;
                const totalTokens = completion.usage.total_tokens;
                const cachedTokens = completion.usage?.prompt_tokens_details?.cached_tokens || 0;

                // Execute update
                updateStmt.run(
                    llmResponse,
                    promptTokens,
                    completionTokens,
                    totalTokens,
                    cachedTokens,
                    post.post_id
                );

                console.log(`Processed post ${post.post_id}:` +
                    `- Prompt tokens: ${promptTokens}` +
                    `- Completion tokens: ${completionTokens}` +
                    `- Total tokens: ${totalTokens}` +
                    `- Cached tokens: ${cachedTokens}`);

            } catch (error) {
                console.error(`Error processing post ${post.post_id}:`, error);
            }

            const endTime = new Date();
            const totalTime = (endTime - startTime) / 1000; // in seconds
            console.log(`Total time for processing all posts: ${totalTime} seconds`);

            // Sleep for 1 min to avoid rate limiting
            console.log('Sleeping for 1 min...');
            await new Promise(resolve => setTimeout(resolve, 120 * 1000));
        }

    } catch (error) {
        console.error('Error in main process:', error);
    } finally {
        db.close();
    }
}

main().catch(console.error);