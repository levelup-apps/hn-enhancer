const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const DIST_DIR = 'dist';
const EXTENSION_DIR = 'Hacker-News-Companion';
const OUTPUT_FILE = 'Hacker-News-Companion.zip';

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
        // Clean previous builds
        console.log('Cleaning previous builds...');
        if (fs.existsSync(DIST_DIR)) {
            fs.rmSync(DIST_DIR, { recursive: true, force: true });
        }

        // Create dist directory
        console.log('Creating dist directory...');
        fs.mkdirSync(DIST_DIR);

        // Create extension directory inside dist
        const extensionPath = path.join(DIST_DIR, EXTENSION_DIR);
        fs.mkdirSync(extensionPath);

        // Create images directory
        const imagesPath = path.join(extensionPath, 'images');
        fs.mkdirSync(imagesPath);

        // Copy main files
        console.log('Copying extension files...');
        FILES_TO_COPY.forEach(file => {
            fs.copyFileSync(
                file,
                path.join(extensionPath, file)
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

        // Add the extension directory to the archive
        archive.directory(extensionPath, false);

        // Finalize the archive
        await archive.finalize();

    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

// Run the build
build();