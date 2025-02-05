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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import {decode} from "html-entities";
import { parse }  from "node-html-parser";


async function fetchHNComments(postId) {
    const url = `https://hn.algolia.com/api/v1/items/${postId}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch comments for post ID ${postId}: ${response.statusText}`);
    }
    return response.json();
}

async function fetchHNPage(postId) {
    const url = `https://news.ycombinator.com/item?id=${postId}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch HN page for post ID ${postId}: ${response.statusText}`);
    }
    return response.text();
}

function getDownvoteLevel(className) {
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
    return downvoteMap[className] || 0;
}

export function hello() {
    return "hello";
}

async function getCommentsFromDOM(postId) {

    const html = await fetchHNPage(postId);
    const root = parse(html);

    // Create a map to store comment positions and scores
    // const commentPositions = new Map();
    const commentsInDOM = new Map();

    // First pass: collect all comments and their metadata
    const commentElements = root.querySelectorAll('.comtr');
    console.log(`Found ${commentElements.length} comments in HN page`);

    // Comments in the DOM are ordered according to the upvotes they received.
    // We get the down votes of the comment also from these DOM elements only.
    commentElements.forEach((el, index) => {
        const commentId = el.getAttribute('id');

        const commentDiv = el.querySelector('.commtext');

        if (commentDiv) {

            // Get the comment text from the div - this will be the best formatted text for LLM.
            //  - Remove any HTML tags (eg: <code>) from the text
            const commentText = decode(commentDiv.innerText)
                .replace(/<[^>]*>/g, '')
                .replace(/\n+/g, ' ');

            // Get the down votes of the comment in order to calculate the score later
            let downvoteClass = null;
            const classes = commentDiv.classList.toString();
            const match = classes.match(/c[0-9a-f]{2}/);
            if (match) {
                downvoteClass = match[0];
            }

            const downvotes = downvoteClass ? getDownvoteLevel(downvoteClass) : 0;

            // create a new array to store the comments in the order they appear in the DOM
            commentsInDOM.set(Number(commentId), {
                position: index,
                text: commentText,
                downvotes: downvotes,
            });
        }

    });
    return commentsInDOM;
}

export function structurePostComments(post, commentsInDOM) {
    let commentsMap = new Map();  // Use map for faster lookups

    // Step 1: Flatten to map and add position and parent relationship
    function flattenCommentTree(comment, parentId) {
        // Skip the story, only process comments
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

        // Add comment to map
        commentsMap.set(comment.id, {
            author: comment.author,
            replies: comment.children?.length || 0,
            position: position,
            text: text,
            downvotes: downvotes,
            parentId: parentId,
        });

        // Process children
        if (comment.children && comment.children.length > 0) {
            comment.children.forEach(child => {
                flattenCommentTree(child, comment.id);
            });
        }
    }

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

    // Flatten and collect comments
    flattenCommentTree(post, null);

    // Sort comments by position and convert to new map
    const structuredComments = new Map([...commentsMap.entries()]
        .sort((a, b) => a[1].position - b[1].position));

    // Add paths after sorting
    let topLevelCounter = 1;

    structuredComments.forEach((comment, id) => {
        if (comment.parentId === post.id) {
            // Top level comment
            comment.path = String(topLevelCounter++);
        } else {
            // Child comment
            const parentPath = structuredComments.get(comment.parentId).path;

            const parentChildren = [...structuredComments.values()]
                .filter(c => c.parentId === comment.parentId);

            const positionInParent = parentChildren
                .findIndex(c => c.id === comment.id) + 1;
            comment.path = `${parentPath}.${positionInParent}`;
        }
    });

    // Add scores
    structuredComments.forEach(comment => {
        comment.score = calculateScore(comment, structuredComments.size);
    });

    return structuredComments;
}

function savePostCommentsToDisk(postId, commentsMap) {

    const filePath = path.join(__dirname, 'output', `${postId}.txt`);

    // Get the directory path from the full file path
    const dir = path.dirname(filePath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    let content = '';
    commentsMap.forEach(comment => {
        content += `[${comment.path}] (Score: ${comment.score}) <replies: ${comment.replies}> ${comment.author}: ${comment.text}\n`;
    });

    fs.writeFileSync(filePath, content, 'utf8');

    return filePath;
}

async function saveFormattedComments(postId) {
    try {

        console.log(`Parsing HN page for post ${postId} ...`);

        let post = await fetchHNComments(postId);

        const commentsInDOM = await getCommentsFromDOM(postId);
        const structuredComments = structurePostComments(post, commentsInDOM);

        console.log('\nStructured Comments:');
        structuredComments.forEach((comment, id) => {
            const content = `[${comment.path}] (Score: ${comment.score}) <replies: ${comment.replies}> ${comment.author}: ${comment.text}`;
            // console.log(`${id}: ${content}`);
        });

        const filePath = savePostCommentsToDisk(postId, structuredComments);
        console.log(`\nStructured comments saved to ${filePath}`);

    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
}


// main function that calls the saveFormattedComments function
async function main() {
    const postIds = JSON.parse(fs.readFileSync(path.join(__dirname, 'post-Ids.json'), 'utf8'));
    for (const postId of postIds) {
        await saveFormattedComments(postId);
    }
}

// Only run the main function if this file is being run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error('Error in main:', error);
        process.exit(1);  // Exit with error code
    });
}