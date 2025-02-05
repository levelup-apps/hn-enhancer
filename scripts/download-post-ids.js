// The script will collect the post IDs for each story on the home page for the past N days
// and saves them to post-ids.json.

import fetch from 'node-fetch';
import { parse } from 'node-html-parser';
import fs from 'fs/promises';
import {fileURLToPath} from "url";
import path, {dirname} from "path";

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

async function main(numDays) {
    const allPostIds = new Set();
    const today = new Date();
    
    // Collect posts for the past 90 days
    for (let i = 0; i < numDays; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        
        console.log(`Fetching posts for ${date.toISOString().split('T')[0]}...`);
        const postIds = await getPostIdsForDate(date);
        postIds.forEach(id => allPostIds.add(id));
        
        // Add a small delay to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 10_000));
    }
    
    // Save the results to a file
    const outputPath = path.join(__dirname, 'data', 'post-ids.json');
    await fs.writeFile(outputPath, JSON.stringify(Array.from(allPostIds), null, 2));
    
    console.log(`\nCollection complete! Found ${allPostIds.size} unique post IDs.`);
    console.log(`Results saved to ${outputPath}`);
}

// Get number of days to collect from command line arguments
const numDays = parseInt(process.argv[2], 10) || 10; // Default to 10 days
main(numDays).catch(console.error);
