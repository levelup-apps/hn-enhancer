import path, {dirname} from "path";
import {fileURLToPath} from "url";
import {createClient} from "@libsql/client";
import dotenv from "dotenv";

// set up the context to read the .env file from the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({path: path.join(__dirname, '.env')});

async function connectDb() {
    // Connect to SQLite database in Turso with a local replica
    const localDbPath = "file:" + path.join(__dirname, 'data/hn_posts.db');
    const db = createClient({
        url: localDbPath,
        syncUrl: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
        syncInterval: 30,
    });

    try {
        await db.sync();
        return db;
    } catch (error) {
        console.error('Error establishing database connection:', error);
        throw error;
    }
}

async function getJobProgress(db) {

    // get the number of posts downloaded
    let result = await db.execute(
        `SELECT 
            COUNT(CASE WHEN processed = 1 THEN 1 END) as processed_posts,
            COUNT(*) as total_posts 
         FROM daily_posts`
    );
    const downloadedPosts = result.rows?.[0]?.processed_posts ?? 'none';
    const totalPostsToDownload = result.rows?.[0]?.total_posts ?? 'none';

    // get the number of posts summarized
    result = await db.execute(
        `SELECT 
            COUNT(CASE WHEN llm_processed = 1 THEN 1 END) as summarized_posts,
            COUNT(*) as total_posts_with_comments 
         FROM posts_comments`
    );
    const summarizedPosts = result.rows?.[0]?.summarized_posts ?? 'none';
    const totalPostsToSummarize = result.rows?.[0]?.total_posts_with_comments ?? 'none';

    return {downloadedPosts, totalPostsToDownload, summarizedPosts, totalPostsToSummarize};
}

async function main() {
    const db = await connectDb();

    // get the job progress - number of posts downloaded and summarized
    const jobProgress = await getJobProgress(db);
    const {
        downloadedPosts,
        totalPostsToDownload,
        summarizedPosts,
        totalPostsToSummarize
    } = jobProgress;

    console.log(`\nJob progress:`);
    console.log(`...Download  Posts job: ${Math.round((downloadedPosts / totalPostsToDownload) * 100)}% done, ` +
        `Downloaded: ${downloadedPosts}/${totalPostsToDownload}, ` +
        `Pending: ${totalPostsToDownload - downloadedPosts}/${totalPostsToDownload}`);
    console.log(`...Summarize Posts job: ${Math.round((summarizedPosts / totalPostsToSummarize) * 100)}% done, ` +
        `Summarized: ${summarizedPosts}/${totalPostsToSummarize}, ` +
        `Pending: ${totalPostsToSummarize - summarizedPosts}/${totalPostsToSummarize}`);

    await db.close();
}

main().catch(console.error);