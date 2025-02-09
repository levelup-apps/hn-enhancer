import fs from 'fs/promises';
import path, {dirname} from 'path';
import {fileURLToPath} from "url";

// Utility to read file content
async function readFileContent(filepath) {
    try {
        const content = await fs.readFile(filepath, 'utf-8');
        return content.trim();
    } catch (error) {
        console.error(`Error reading file ${filepath}:`, error);
        throw error;
    }
}

// Create dataset from files
async function createDatasetFromFiles(dataDirRelativePath) {
    try {

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);

        // Convert relative path to absolute path
        const dataDir = path.join(__dirname, dataDirRelativePath);
        console.log('Reading files from data directory:', dataDir);

        // Get all files in directory
        const files = await fs.readdir(dataDir);
        // Filter for comment files
        const commentFiles = files
            .filter(file => file.endsWith('_comments.md'))
            .map(file => path.join(dataDir, file));

        const datasetList = [];

        for (const commentFile of commentFiles) {
            // Get corresponding summary file
            const postId = path.basename(commentFile).split('_')[0];
            const summaryFile = path.join(dataDir, `${postId}_summary.md`);

            // Check if summary file exists
            try {
                await fs.access(summaryFile);
            } catch {
                console.warn(`Warning: No summary file found for ${commentFile}`);
                continue;
            }

            // Read contents
            console.log('Reading comments file:', commentFile);
            const comments = await readFileContent(commentFile);

            console.log('Reading summary file:', summaryFile);
            const summary = await readFileContent(summaryFile);

            const instruction = "Analyze and summarize the following Hacker News thread. The title of the post and comments are separated by dashed lines.";

            // Add to training pairs
            datasetList.push({
                id: postId,
                instruction,
                input_comment: comments,
                output_summary: summary
            });
        }

        return datasetList;
    } catch (error) {
        console.error('Error creating dataset:', error);
        throw error;
    }
}

// Upload dataset to Hugging Face
async function uploadToHub(datasetDict, repoName, isPrivate = true) {
    const token = process.env.HF_TOKEN;
    if (!token) {
        throw new Error('HF_TOKEN environment variable is required');
    }

    // First, create the repository if it doesn't exist
    try {
        await fetch(`https://huggingface.co/api/repos/create`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: repoName.split('/')[1],
                organization: repoName.split('/')[0],
                private: isPrivate,
                type: 'dataset'
            })
        });
    } catch (error) {
        // Repository might already exist, continue
        console.log('Repository creation status:', error.message);
    }

    // Upload each split as a separate JSON file
    const uploadApiUrl = `https://huggingface.co/api/datasets/${repoName}/upload`;

    for (const [split, data] of Object.entries(datasetDict)) {
        const filename = `${split}.json`;
        const content = JSON.stringify(data, null, 2);
        console.log(`filename: ${filename} content: ${content}`);

        try {
            console.log(`Uploading ${split} dataset to HF using API url ${uploadApiUrl} ...`);
            const response = await fetch(uploadApiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    path: filename,
                    content: content
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to upload ${split} dataset: ${response.status} ${response.statusText}`);
            }

            console.log(`Successfully uploaded ${split} dataset`);
        } catch (error) {
            console.error(`Error uploading ${split} dataset:`, error);
            throw error;
        }
    }

    // Upload dataset card (README.md)
    const datasetCard = `---
language:
- en
license: mit
---

# Dataset Card for ${repoName}

## Dataset Description

This dataset contains Hacker News comments and their summaries.

### Data Fields

- id: Unique identifier for each example
- instruction: The instruction for summarization
- input_comment: The input Hacker News comments
- output_summary: The corresponding summary
`;

    try {
        await fetch(uploadApiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: 'README.md',
                content: datasetCard
            })
        });
    } catch (error) {
        console.error('Error uploading dataset card:', error);
        // Continue even if dataset card upload fails
    }
}

// Main execution
async function main() {
    const TRAINING_DATA_DIR = "datasets/training_data";
    const VALIDATION_DATA_DIR = "datasets/validation_data";
    const REPO_NAME = "annjose/hn-comments-new";

    try {
        // Create datasets
        const trainDataset = await createDatasetFromFiles(TRAINING_DATA_DIR);
        const valDataset = await createDatasetFromFiles(VALIDATION_DATA_DIR);

        // Create dataset dictionary
        const datasetDict = {
            train: trainDataset,
            val: valDataset
        };

        // Upload to Hugging Face
        console.log(`Uploading dataset to Hugging Face repo ${REPO_NAME} ...`);
        await uploadToHub(datasetDict, REPO_NAME, true);
        console.log('\nDataset uploaded successfully!');

    } catch (error) {
        console.error('Error in main execution:', error);
        process.exit(1);
    }
}

main();