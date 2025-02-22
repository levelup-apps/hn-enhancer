// The script will collect the post IDs for each story on the home page for the past N days
// and saves them to a SQLite database.

import fetch from 'node-fetch';
import { parse } from 'node-html-parser';
import {fileURLToPath} from "url";
import path, {dirname} from "path";
import {createClient} from "@libsql/client";  // Add this import at the top
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env in the current folder
dotenv.config({path: path.join(__dirname, '.env')});

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

async function downloadPostIds(startDate, numDays) {

    // Initialize SQLite database
    const localDbPath = "file:" + path.join(__dirname, 'data/hn_posts.db');
    const db = createClient({
        url: localDbPath,
        syncUrl: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
        syncInterval: 10,
    });

    try {
        await db.sync();
        console.log('Database connection established');
    } catch (error) {
        console.error('Error establishing database connection: ', error);
        throw error;
    }

    // Create tables if they don't exist
    await db.execute(`
        CREATE TABLE IF NOT EXISTS daily_posts (
            date TEXT,
            post_id TEXT,
            processed INTEGER DEFAULT 0,
            PRIMARY KEY (date, post_id)
        )
    `);

    const insertStmt = `INSERT OR IGNORE INTO daily_posts (date, post_id) VALUES (?, ?)`;
    let totalNewPosts = 0;
    let dayIndex = 0;
    
    // Collect posts for the specified number of days
    for (let i = 1; i <= numDays; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() - i);
        const formattedDate = date.toISOString().split('T')[0];
        
        console.log(`\n[Day ${dayIndex + 1}/${numDays}]: Fetching post id's for date ${formattedDate}...`);

        const postIds = await getPostIdsForDate(date);
        
        // Insert posts into database - as a transaction to commit all or none
        try {
            console.log(`...Inserting ${postIds.length} post id's into the db...`);
            await db.execute('BEGIN TRANSACTION');

            // Insert each post
            for (const postId of postIds) {
                await db.execute({
                    sql: insertStmt,
                    args: [formattedDate, postId]
                });
            }

            await db.execute('COMMIT');
        } catch (error) {
            await db.execute('ROLLBACK');
            console.error(`...Error inserting post id's for ${formattedDate} in the db:`, error);
            throw error;
        }
        
        totalNewPosts += postIds.length;
        console.log(`...Insertion done. Total posts added to db: ${totalNewPosts}`);

        dayIndex++;

        if(dayIndex < numDays) {
            // Add a small delay to avoid overwhelming the server
            console.log('\nSleeping 10 seconds to avoid throttling...');
            await new Promise(resolve => setTimeout(resolve, 10_000));
        }
    }
    
    // Get total number of unique posts in database
    const result = await db.execute('SELECT COUNT(DISTINCT post_id) as count FROM daily_posts');
    const totalPostsInDb = result.rows?.[0]?.count ?? 'none';

    console.log(`\nDownload done! Added ${totalNewPosts} new posts to the db in this session. Total # of posts in db: ${totalPostsInDb}.`);

    await db.close();
}

async function main() {

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

    console.log(`Fetching post id's for ${numDays} days starting from ${startDateString}...`);

    try {
        await downloadPostIds(startDate, numDays);
    } catch (error) {
        console.error('Error in main process:', error);
    }
}

main().catch(console.error);