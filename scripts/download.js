// This is a Node.js script that fetches comments from HN and saves them to a text file
// The goal of this script is to create a dataset to fine-tune LLMs to create better summaries for the Hacker News Companion extension.
// It will create a dataset of comments with the following structure:
// [hierarchy_path] (Score: 4.5) <replies: 3> Author: Comment content
// The hierarchy path should follow the same sequence as Hacker News comments. It is a sequence of IDs that can be used to navigate the comment tree.
// The score is the average score of the comment and its children.
// The replies field is the number of comments that are replies to the current comment.
// The author is the user who wrote the comment.
// The content is the text of the comment.

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import {createClient} from "@libsql/client";
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import {decode} from "html-entities";
import { parse }  from "node-html-parser";
import Bottleneck from "bottleneck";

dotenv.config({ path: path.join(__dirname, '.env') });

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

export function extractCommentsFromPost(commentsTree, commentsInDOM) {

    // Here, we enrich the comments as follows:
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
    const enrichedComments = new Map([...flatComments.entries()]
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
            const parentPath = enrichedComments.get(comment.parentId).path;

            // get all the children of this comment's parents - this is the list of siblings
            const siblings = [...enrichedComments.values()]
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
    enrichedComments.forEach(comment => {
        comment.path = calculatePath(comment);
        comment.score = calculateScore(comment, enrichedComments.size);
    });

    console.log(`...Enriched ${enrichedComments.size} comments`);
    return enrichedComments;
}

function savePostToDisk(postId, comments) {

    const filePath = path.join(__dirname, 'output', `${postId}.txt`);

    // Get the directory path from the full file path
    const dir = path.dirname(filePath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    let content = '';
    comments.forEach(comment => {
        const line = [
            `[${comment.path}]`,
            `(score: ${comment.score})`,
            `<replies: ${comment.replies}>`,
            `{downvotes: ${comment.downvotes}}`,
            `${comment.author}:`,
            comment.text
        ].join(' ') + '\n';

        content += line;
    });

    fs.writeFileSync(filePath, content, 'utf8');

    return filePath;
}

async function savePostToDatabase(postId, db, postData, comments, commentPathMap, commentInfoMap) {

    // Format comments into a single string
    let formattedComments = '';
    comments.forEach(comment => {
        const line = [
            `[${comment.path}]`,
            `(score: ${comment.score})`,
            `<replies: ${comment.replies}>`,
            `{downvotes: ${comment.downvotes}}`,
            `${comment.author}:`,
            comment.text
        ].join(' ') + '\n';

        formattedComments += line;
    });


    // Convert the comment path map to an array and then to a JSON string to store in the database
    //   You can read it back like this: new Map(JSON.parse(commentPathMapAsArray))
    const commentPathMapAsArray = JSON.stringify([...commentPathMap.entries()]);
    const commentInfoMapAsArray = JSON.stringify([...commentInfoMap.entries()]);

    await db.execute({
        sql: `INSERT INTO posts_comments (post_id, post_author, post_created_at, post_title,
                                          post_url, post_total_comments, post_points, 
                                          post_formatted_comments, comment_path_map, comment_info_map)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
            postId,
            postData.author,
            postData.created_at_i,
            postData.title,
            postData.url,
            comments.size,
            postData.points,
            formattedComments,
            commentPathMapAsArray,
            commentInfoMapAsArray
        ]
    });
    console.log(`...Post saved to database. Post Id: ${postId}`);
}

async function downloadPostComments(postId) {
    try {
        // Get the comments from the HN API as well as the DOM
        //  API comments are in JSON format structured as a tree and represents the hierarchy of comments
        const post = await fetchHNPostFromAPI(postId);

        // DOM comments (comments in the HTML page) are ordered in the correct sequence as per the up votes.
        // Fetch them and extract the position, text and down votes.
        const postHtml = await fetchHNPage(postId);
        console.log(`...Getting comments from DOM...`);
        const commentsInDOM = await getCommentsFromDOM(postHtml);

        // Merge the two data sets to structure the comments based on hierarchy, votes and position.
        //  API is the source of truth of post and comments, but that data doesn't have all the information we need.
        //  Specifically, the data from API doesn't have the position down votes and 'flagged' marker of the comments.
        //  The data from the DOM has this information, so we enrich the API data with this information.
        console.log(`...Extracting comments...`);
        const postComments = extractCommentsFromPost(post, commentsInDOM);

        // Create a map of comment path to comment ID
        const commentPathMap = new Map();
        postComments.forEach(comment => {
            commentPathMap.set(comment.path, comment.id);
        });

        // Create a map of comment info for further analysis
        const commentInfoMap = new Map();
        postComments.forEach(comment => {
            commentInfoMap.set(comment.id, {
                author: comment.author,
                path: comment.path,
                replies: comment.replies,
                position: comment.position,
                downvotes: comment.downvotes,
                score: comment.score,
            });
        });
        return {
            post,
            postComments,
            commentPathMap,
            commentInfoMap
        };

    } catch (error) {
        console.error(`...Error downloading comments. ${error.message}`);
    }
}

function getPostIdsFromFile() {
    const inputFilePath = path.join(__dirname, 'input.json');
    const inputJson = JSON.parse(fs.readFileSync(inputFilePath, 'utf8'));
    return inputJson.postIds;
}

// main function that processes posts from SQLite database
async function main() {
    let db;
    try {
        const useDatabase = true;
        console.log(`\nStarting download process. Getting post ids from ${useDatabase ? 'database data/hn_posts.db' : 'file input.json'}...`);

        let postIds = [];
        if(useDatabase) {
            const dbPath = "file:" + path.join(__dirname, 'data/hn_posts.db');

            db = createClient({
                url: dbPath,
                syncUrl: process.env.TURSO_DATABASE_URL,
                authToken: process.env.TURSO_AUTH_TOKEN
            });

            await db.sync();

            // Create posts_comments table if it doesn't exist
            await db.execute(`
                CREATE TABLE IF NOT EXISTS posts_comments
                (
                    post_id                         INTEGER primary key,
                    post_author                     TEXT,
                    post_created_at                 INTEGER,
                    post_title                      TEXT,
                    post_url                        TEXT,
                    post_total_comments             INTEGER,
                    post_points                     INTEGER,
                    post_formatted_comments         TEXT,
                    comment_path_map                TEXT,
                    comment_info_map                TEXT,
                    downloaded_at                   TEXT    DEFAULT (datetime('now')),
                    llm_response_summary            TEXT,
                    llm_response_input_token_count  INTEGER,
                    llm_response_output_token_count INTEGER,
                    llm_response_total_token_count  INTEGER,
                    llm_processed                   INTEGER default 0,
                    llm_model_name                  TEXT
                );
            `);

            // Get unprocessed post IDs from daily_posts table


            const result = await db.execute('SELECT post_id FROM daily_posts WHERE processed = 0');
            postIds = result.rows.map(post => post.post_id);
        } else {
            postIds = getPostIdsFromFile();
        }

        const limiter = new Bottleneck({
            minTime: 4_000, // 4 seconds
            maxConcurrent: 1
        });

        // Process each post ID
        console.log(`Processing ${postIds.length} posts...\n`);
        let postIndex = 0;

        for (const postId of postIds) {
            await limiter.schedule(async () => {

                try {
                    console.log(`[${postIndex + 1}/${postIds.length}] Post Id: ${postId}. Downloading comments...`);
                    const downloadedPost = await downloadPostComments(postId);

                    // Save to database or file
                    if (useDatabase) {
                        // Save the comments to database and mark post as processed in daily_posts table
                        await savePostToDatabase(postId, db,
                                                downloadedPost.post,
                                                downloadedPost.postComments,
                                                downloadedPost.commentPathMap,
                                                downloadedPost.commentInfoMap);
                        await db.execute({
                            sql: 'UPDATE daily_posts SET processed = 1 WHERE post_id = ?',
                            args: [postId]
                        });
                        console.log(`SUCCESS! Post ${postId} downloaded and saved to DB.\n`);
                    } else {
                        const filePath = savePostToDisk(postId, downloadedPost.postComments);
                        console.log(`SUCCESS! Post ${postId} downloaded and saved to file: ${filePath}\n`);
                    }
                    postIndex++;
                } catch (error) {
                    console.error(`ERROR downloading post ${postId}. Error: ${error.message}`);
                }
            });
        }
        console.log('\nAll posts processed successfully');
    } catch (error) {
        console.error('ERROR in main:', error);
    }
    finally {
        if(db) {
            await db.close();
        }
    }
}

// Only run the main function if this file is being run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error('Error in main:', error);
        process.exit(1);  // Exit with error code
    });
}