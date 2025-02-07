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
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import {decode} from "html-entities";
import { parse }  from "node-html-parser";
import Bottleneck from "bottleneck";


async function fetchHNCommentsFromAPI(postId) {
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

async function getCommentsFromDOM(postHtml) {

    // Comments in the DOM are arranged according to their up votes. This gives us the position of the comment.
    //  We will also extract the downvotes and text of the comment (after sanitizing it).
    // Create a map to store comment positions, downvotes and the comment text.
    const commentsInDOM = new Map();

    const rootElement = parse(postHtml);

    // Step 1: collect all comments and their metadata
    const commentElements = rootElement.querySelectorAll('.comtr');
    console.log(`...Fetched ${commentElements.length} comments from the DOM.`);

    let skippedComments = 0;
    commentElements.forEach((el, index) => {
        const commentId = el.getAttribute('id');

        const commentDiv = el.querySelector('.commtext');

        if (!commentDiv) {
            // If the comment div is not found, that means it is flagged. So we skip this iteration and continue the loop
            skippedComments++;
            return;
        }

        // Step 2: Sanitize the comment text (remove unnecessary html tags, encodings)
        function sanitizeCommentText() {

            // Remove unwanted HTML elements from the clone
            [...commentDiv.querySelectorAll('a, code, pre')].forEach(element => element.remove());

            // Replace <p> tags with their text content
            commentDiv.querySelectorAll('p').forEach(p => {
                const text = p.textContent;
                p.replaceWith(text);
            });

            // Remove unnecessary new lines and decode HTML entities by decoding the HTML entities
            const sanitizedText = decode(commentDiv.innerHTML)
                .replace(/\n+/g, ' ');

            return sanitizedText;
        }
        const commentText = sanitizeCommentText();

        // Step 3: Get the down votes of the comment in order to calculate the score later
        // Downvotes are represented by the color of the text. The color is a class name like 'c5a', 'c73', etc.
        function getDownvoteCount() {
            let downvoteClass = null;
            const classes = commentDiv.classList.toString();
            const match = classes.match(/c[0-9a-f]{2}/);
            if (!match) {
                return 0;
            }

            downvoteClass = match[0];
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
        const downvotes = getDownvoteCount();

        // Step 4: Add the position, text and downvotes of the comment to the map
        commentsInDOM.set(Number(commentId), {
            position: index,
            text: commentText,
            downvotes: downvotes,
        });

    });

    console.log(`...Extracted ${commentsInDOM.size} comments from DOM. Skipped ${skippedComments} flagged comments.`);
    return commentsInDOM;
}

export function enrichPostComments(commentsTree, commentsInDOM) {

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
    function flattenCommentTree(comment, parentId) {

        // Track the number of comments as we traverse the tree to find the comments from HN API.
        apiComments++;

        // Skip the story items, do not add to the flat map. Only process its children (comments)
        if (comment.type !== 'comment') {
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

        // Get all values from DOM comments map in one lookup
        const domComment = commentsInDOM.get(comment.id) || {};
        const { position = 0, text = '', downvotes = 0 } = domComment;

        // Add comment to map along with its metadata including position, downvotes and parentId that are needed for scoring.
        flatComments.set(comment.id, {
            author: comment.author,
            replies: comment.children?.length || 0,
            position: position,
            text: text,
            downvotes: downvotes,
            parentId: parentId,
        });

        // Process children of the current comment, pass the comment id as the parent id to the next iteration
        //  so that the parent-child relationship is retained and we can use it to calculate the path later.
        if (comment.children && comment.children.length > 0) {
            comment.children.forEach(child => {
                flattenCommentTree(child, comment.id);
            });
        }
    }

    // Flatten the comment tree and collect comments as a map
    flattenCommentTree(commentsTree, null);
    console.log(`...Fetched ${apiComments} comments from the API. Flattened ${flatComments.size} comments. Skipped 1 story item.`);

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
            `${comment.author}:`,
            comment.text
        ].join(' ') + '\n';

        content += line;
    });

    fs.writeFileSync(filePath, content, 'utf8');

    return filePath;
}

function savePostToDatabase(postId, postData, comments, db) {
    const insertStmt = db.prepare(`
        INSERT INTO data_set (
            post_id, post_author, post_created_at, post_title,
            post_url, post_total_comments, post_points, post_formatted_comments
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Format comments into a single string
    let formattedComments = '';
    comments.forEach(comment => {
        const line = [
            `[${comment.path}]`,
            `(score: ${comment.score})`,
            `<replies: ${comment.replies}>`,
            `${comment.author}:`,
            comment.text
        ].join(' ') + '\n';

        formattedComments += line;
    });

    // Insert the data
    insertStmt.run(
        postId,
        postData.author,
        postData.created_at_i,
        postData.title,
        postData.url,
        comments.size,
        postData.points,
        formattedComments
    );

    console.log(`...Post saved to database table data_set. Post Id: ${postId}`);
}

async function downloadPostComments(postId) {
    try {
        // Get the comments from the HN API as well as the DOM
        //  API comments are in JSON format structured as a tree and represents the hierarchy of comments
        const commentsJson = await fetchHNCommentsFromAPI(postId);

        // DOM comments (comments in the HTML page) are ordered in the correct sequence as per the up votes.
        // Fetch them and extract the position, text and down votes.
        const postHtml = await fetchHNPage(postId);
        console.log(`...Getting comments from DOM...`);
        const commentsInDOM = await getCommentsFromDOM(postHtml);

        // Merge the two data sets to structure the comments based on hierarchy, votes and position
        console.log(`...Enriching comments...`);
        const enrichedComments = enrichPostComments(commentsJson, commentsInDOM);

        return {
            enrichedComments: enrichedComments,
            postMetaData: commentsJson
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
    try {
        const useDatabase = true;

        // Connect to SQLite database
        const db = new Database(path.join(__dirname, 'data/hn_posts.db'));

        // Create data_set table if it doesn't exist
        db.exec(`
            CREATE TABLE IF NOT EXISTS data_set (
                post_id INTEGER primary key,
                post_author TEXT,
                post_created_at INTEGER,
                post_title TEXT,
                post_url TEXT,
                post_total_comments INTEGER,
                post_points INTEGER,
                post_formatted_comments TEXT,
                llm_response TEXT
            )
        `);

        // Get unprocessed post IDs from daily_posts table
        const posts = db.prepare('SELECT post_id FROM daily_posts WHERE processed = 0').all();
        const postIds = useDatabase ? posts.map(post => post.post_id) : getPostIdsFromFile();

        const limiter = new Bottleneck({
            minTime: 10_000, // 10 seconds
            maxConcurrent: 1
        });

        // Process each post ID
        console.log(`Processing ${postIds.length} posts...\n`);
        let postIndex = 0;

        for (const postId of postIds) {
            await limiter.schedule(async () => {

                try {
                    console.log(`[${postIndex + 1}/${postIds.length}] Post Id: ${postId}. Downloading comments...`);
                    const downloadedPost = await downloadPostComments(postId, db);

                    // Save to database or file
                    if (useDatabase) {
                        // Save the comments to database and mark post as processed in daily_posts table
                        savePostToDatabase(postId, downloadedPost.postMetaData, downloadedPost.enrichedComments, db);
                        db.prepare('UPDATE daily_posts SET processed = 1 WHERE post_id = ?').run(postId);
                        console.log(`SUCCESS! Post ${postId} downloaded and saved to DB table data_set.\n`);
                    } else {
                        const filePath = savePostToDisk(postId, downloadedPost.enrichedComments);
                        console.log(`SUCCESS! Post ${postId} downloaded and saved to file: ${filePath}\n`);
                    }
                    postIndex++;
                } catch (error) {
                    console.error(`ERROR downloading post ${postId}. Error: ${error.message}`);
                }
            });
        }

        console.log('\nAll posts processed successfully');
        db.close();
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