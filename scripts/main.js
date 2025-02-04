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
        'cdd': 8
    };
    return downvoteMap[className] || 0;
}

function calculateCommentScore(comment, level, downvotes) {
    // Base score starts at 100 and decreases by 10 for each level deep
    let score = 100 - (level * 10);
    
    // Add points for child comments (engagement)
    const childCount = comment.children ? comment.children.length : 0;
    score += childCount * 5;
    
    // Subtract points for downvotes (20 points per downvote)
    score -= downvotes * 20;
    
    return Math.max(score, 0); // Ensure score doesn't go below 0
}

async function parseHNPageAndUpdateScores(postId, comments) {
    const html = await fetchHNPage(postId);
    const root = parse(html);
    
    // Create a map of comment IDs to their DOM positions
    const commentElements = root.querySelectorAll('.comtr');
    const commentPositions = new Map();
    
    commentElements.forEach((el, index) => {
        const commentId = el.getAttribute('id');
        if (commentId) {
            const downvoteClass = Array.from(el.querySelectorAll('.comment')).find(c => 
                Array.from(c.classList).some(cls => cls.match(/^c[0-9a-f]{2}$/)))?.classList[1];
            
            commentPositions.set(commentId, {
                position: index,
                downvotes: downvoteClass ? getDownvoteLevel(downvoteClass) : 0
            });
        }
    });
    
    // Function to recursively update comment scores
    function updateCommentScores(comment, level = 0) {
        if (!comment) return;
        
        const commentInfo = commentPositions.get(comment.id);
        if (commentInfo) {
            comment.position = commentInfo.position;
            comment.score = calculateCommentScore(comment, level, commentInfo.downvotes);
        }
        
        if (comment.children) {
            comment.children.forEach(child => updateCommentScores(child, level + 1));
            // Sort children by their position in the DOM
            comment.children.sort((a, b) => (a.position || 0) - (b.position || 0));
        }
    }
    
    // Update scores for all comments
    updateCommentScores(comments);
    return comments;
}

function convertToPathFormat(thread) {
    const result = [];
    const commentPathToIdMap = new Map();

    function decodeHTMLEntities(text) {
        return decode(text);
    }

    function sanitizeText(htmlString) {
        const root = parse(htmlString);

        // Remove <a> tags
        root.querySelectorAll('a').forEach(a => a.remove());

        // Remove <code> tags
        root.querySelectorAll('code').forEach(code => code.remove());

        // Remove <pre> tags
        root.querySelectorAll('pre').forEach(pre => pre.remove());

        // Replace <p> tags with new line and the content
        root.querySelectorAll('p').forEach(p => {
            const text = p.text;
            p.replaceWith(text);
        });

        // // remove all HTML tags
        // root.querySelectorAll('*').forEach(node => {
        //     node.remove();
        // });

        const cleanedHtml = root.toString();
        return cleanedHtml;
    }

    function processNode(node, parentPath = "") {
        const currentPath = parentPath ? parentPath : "0";
        let content = "";

        if (node) {
            if (node.type === 'comment') {
                content = node.title || node.text || "";
                if (content === null || content === undefined) {
                    content = "";
                } else {
                    content = decodeHTMLEntities(content);
                    // remove HTML tags like <p>, <a>, <code> etc.
                    content = sanitizeText(content);
                }
                commentPathToIdMap.set(currentPath, node.id);
                result.push(`[${currentPath}] ${node.author}: ${content}`);
            }
            if (node.children && node.children.length > 0) {
                node.children.forEach((child, index) => {
                    let childPath;
                    if (currentPath === "0") {
                        childPath = `${index + 1}`;
                    } else {
                        childPath = `${currentPath}.${index + 1}`;
                    }
                    processNode(child, childPath);
                });
            }
        }
    }

    processNode(thread);
    return {
        formattedComment: result.join('\n'),
        commentPathToIdMap: commentPathToIdMap
    };
}

async function saveFormattedComments(postId) {
    try {
        const thread = await fetchHNComments(postId);
        const { formattedComment } = convertToPathFormat(thread);
        const filePath = path.join(__dirname, 'data', `${postId}.txt`);
        fs.writeFileSync(filePath, formattedComment, 'utf8');
        console.log(`Formatted comments saved to ${filePath}`);
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

main();