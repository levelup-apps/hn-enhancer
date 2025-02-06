import fs from "fs";
import path from "path";
import archiver from "archiver";

const manifestChrome = JSON.parse(fs.readFileSync(new URL("../manifest.chrome.json", import.meta.url)));
const manifestFirefox = JSON.parse(fs.readFileSync(new URL("../manifest.firefox.json", import.meta.url)));

const DIST_DIR = "dist";
const OUTPUT_DIR_CHROME = "chrome";
const OUTPUT_DIR_FIREFOX = "firefox";
const VERSION = manifestChrome.version;
const OUTPUT_FILE_CHROME = `hn-companion-chrome-v${VERSION}.zip`;
const OUTPUT_FILE_FIREFOX = `hn-companion-firefox-v${VERSION}.zip`;

// Files to be included in the extension
const FILES_TO_COPY = [
    "src/background.js",
    "src/content.js",
    "src/options/options-styles.css",
    "src/options/options.html",
    "src/options/options.js",
    "src/page-script.js",
    "src/styles.css",
    "src/summary-panel.js",
];

// Image files with their directory
const IMAGE_FILES = [
    "icon-16.png",
    "icon-32.png",
    "icon-48.png",
    "icon-128.png",
];

async function build() {
    try {
        validateFiles();

        // Clean previous builds
        console.log("Cleaning previous builds...");
        if (fs.existsSync(DIST_DIR)) {
            fs.rmSync(DIST_DIR, {recursive: true, force: true});
        }

        // Create dist directory
        console.log("Creating dist directory...");
        fs.mkdirSync(DIST_DIR);

        // Build for Chrome
        await buildForBrowser(OUTPUT_DIR_CHROME, OUTPUT_FILE_CHROME, manifestChrome);

        // Build for Firefox
        await buildForBrowser(OUTPUT_DIR_FIREFOX, OUTPUT_FILE_FIREFOX, manifestFirefox,);
    } catch (error) {
        console.error("Build failed:", error);
        process.exit(1);
    }
}

async function buildForBrowser(outputDir, outputFile, manifest) {
    // Create output directory inside dist
    const outputPath = path.join(DIST_DIR, outputDir);
    fs.mkdirSync(outputPath);

    // Create images directory
    const imagesPath = path.join(outputPath, "images");
    fs.mkdirSync(imagesPath);

    // Copy main files
    console.log(`Copying extension files for ${outputDir}...`);
    FILES_TO_COPY.forEach(file => {
        const srcPath = file;
        const destPath = path.join(outputPath, path.basename(file));
        fs.copyFileSync(srcPath, destPath);
    });

    // Copy image files
    console.log(`Copying image files for ${outputDir}...`);
    IMAGE_FILES.forEach((file) => {
        fs.copyFileSync(path.join("images", file), path.join(imagesPath, file));
    });

    // Copy manifest file
    console.log(`Copying manifest file for ${outputDir}...`);
    fs.writeFileSync(path.join(outputPath, "manifest.json"), JSON.stringify(manifest, null, 2),);


    // Create zip archive
    console.log(`Creating zip archive for ${outputDir}...`);
    const output = fs.createWriteStream(path.join(DIST_DIR, outputFile));
    const archive = archiver("zip", {
        zlib: {level: 9}, // Maximum compression
    });

    // Listen for archive events
    output.on("close", () => {
        console.log(`Successfully created ${outputFile}`);
        console.log(`Total size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`,);
    });

    archive.on("error", (err) => {
        throw err;
    });

    // Pipe archive data to the output file
    archive.pipe(output);

    // Add the output directory to the archive
    archive.directory(outputPath, false);

    // Finalize the archive
    await archive.finalize();
}

function validateFiles() {
    const missingFiles = [...FILES_TO_COPY, ...IMAGE_FILES.map((f) => `images/${f}`),].filter((file) => !fs.existsSync(file));
    if (missingFiles.length > 0) {
        throw new Error(`Missing required files: ${missingFiles.join(", ")}`);
    }
}

// Run the build
build();
