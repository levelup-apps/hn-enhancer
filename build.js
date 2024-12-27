const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const manifest = require('./manifest.json');

const DIST_DIR = 'dist';
const OUTPUT_DIR = 'hn-companion';
const VERSION = manifest.version;
const OUTPUT_FILE = `hn-companion-v${VERSION}.zip`;

// Files to be included in the extension
const FILES_TO_COPY = [
    'background.js',
    'content.js',
    'manifest.json',
    'options-styles.css',
    'options.html',
    'options.js',
    'page-script.js',
    'styles.css',
    'summary-panel.js'
];

// Image files with their directory
const IMAGE_FILES = [
    'icon-16.png',
    'icon-32.png',
    'icon-48.png',
    'icon-128.png'
];

async function build() {
    try {
        validateFiles();

        // Clean previous builds
        console.log('Cleaning previous builds...');
        if (fs.existsSync(DIST_DIR)) {
            fs.rmSync(DIST_DIR, { recursive: true, force: true });
        }

        // Create dist directory
        console.log('Creating dist directory...');
        fs.mkdirSync(DIST_DIR);

        // Create output directory inside dist
        const outputPath = path.join(DIST_DIR, OUTPUT_DIR);
        fs.mkdirSync(outputPath);

        // Create images directory
        const imagesPath = path.join(outputPath, 'images');
        fs.mkdirSync(imagesPath);

        // Copy main files
        console.log('Copying extension files...');
        FILES_TO_COPY.forEach(file => {
            fs.copyFileSync(
                file,
                path.join(outputPath, file)
            );
        });

        // Copy image files
        console.log('Copying image files...');
        IMAGE_FILES.forEach(file => {
            fs.copyFileSync(
                path.join('images', file),
                path.join(imagesPath, file)
            );
        });

        // Check file sizes after copying
        FILES_TO_COPY.forEach(file => {
            checkFileSize(path.join(outputPath, file));
        });

        // Create zip archive
        console.log('Creating zip archive...');
        const output = fs.createWriteStream(path.join(DIST_DIR, OUTPUT_FILE));
        const archive = archiver('zip', {
            zlib: { level: 9 } // Maximum compression
        });

        // Listen for archive events
        output.on('close', () => {
            console.log(`Successfully created ${OUTPUT_FILE}`);
            console.log(`Total size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
        });

        archive.on('error', (err) => {
            throw err;
        });

        // Pipe archive data to the output file
        archive.pipe(output);

        // Add the output directory to the archive
        archive.directory(outputPath, false);

        // Finalize the archive
        await archive.finalize();

    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

function validateFiles() {
    const missingFiles = [...FILES_TO_COPY, ...IMAGE_FILES.map(f => `images/${f}`)].filter(
        file => !fs.existsSync(file)
    );
    if (missingFiles.length > 0) {
        throw new Error(`Missing required files: ${missingFiles.join(', ')}`);
    }
}

function checkFileSize(filePath) {
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    if (sizeMB > 10) { // Chrome Web Store limit
        console.warn(`Warning: ${filePath} is ${sizeMB.toFixed(2)}MB`);
    }
}

// Run the build
build();