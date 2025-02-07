// The script will collect the post IDs for each story on the home page for the past N days
// and saves them to a SQLite database.

import fetch from 'node-fetch';
import { parse } from 'node-html-parser';
import {fileURLToPath} from "url";
import path, {dirname} from "path";
import Database from 'better-sqlite3';
import fs from 'fs';  // Add this import at the top

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'https://news.ycombinator.com';

async function getPostIdsForDate(date) {
    const formattedDate = date.toISOString().split('T')[0];
    const url = `${BASE_URL}/front?day=${formattedDate}`;
    
    try {
        const response = await fetch(url);
        const html = await response.text();
        const root = parse(html);
        
        // Find all story links and extract their IDs
        const storyLinks = root.querySelectorAll('.subline > a:nth-of-type(2)');
        const postIds = new Set();
        
        for (const link of storyLinks) {
            if (!link.getAttribute('href')) 
                continue;
            
            const itemId = link.getAttribute('href').split('=')[1];
            if (itemId) 
                postIds.add(itemId);
        }
        
        return Array.from(postIds);
    } catch (error) {
        console.error(`Error fetching posts for ${formattedDate}:`, error);
        return [];
    }
}

async function main(startDate, numDays) {
    const dataDir = path.join(__dirname, 'data');
    const dbPath = path.join(dataDir, 'hn_posts.db');

    // Create the data directory if it doesn't exist
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = new Database(dbPath);

    // Create tables if they don't exist
    db.exec(`
        CREATE TABLE IF NOT EXISTS daily_posts (
            date TEXT,
            post_id TEXT,
            processed INTEGER DEFAULT 0,
            PRIMARY KEY (date, post_id)
        )
    `);

    const insertPost = db.prepare('INSERT OR IGNORE INTO daily_posts (date, post_id) VALUES (?, ?)');
    let totalPosts = 0;
    
    // Collect posts for the specified number of days
    for (let i = 1; i < numDays; i++) {
        const date = startDate;
        date.setDate(startDate.getDate() - i);
        const formattedDate = date.toISOString().split('T')[0];
        
        console.log(`Fetching posts for ${formattedDate}...`);
        const postIds = await getPostIdsForDate(date);
        
        // Insert posts into database
        const transaction = db.transaction(() => {
            for (const postId of postIds) {
                insertPost.run(formattedDate, postId);
            }
        });
        transaction();
        
        totalPosts += postIds.length;
        console.log(`Added ${postIds.length} posts for ${formattedDate}`);
        
        // Add a small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 10_000));
    }
    
    // Get total unique posts in database
    const totalUniquePosts = db.prepare('SELECT COUNT(DISTINCT post_id) as count FROM daily_posts').get().count;
    
    console.log(`\nCollection complete! Added ${totalPosts} posts (${totalUniquePosts} unique) to the database.`);
    console.log(`Database saved at ${dbPath}`);
    
    db.close();
}


// Get start date from command line arguments
const startDateString = process.argv[2];
if (!startDateString) {
    console.error('Please provide a start date in the format: YYYY-MM-DD. eg. 2025-02-04');
    process.exit(1);
}

// parse the date string (YYYY-MM-DD) into a Date object
const startDate = new Date(startDateString);

// Get number of days to collect from command line arguments
const numDays = parseInt(process.argv[3], 10) || 10; // Default to 10 days

main(startDate, numDays).catch(console.error);
