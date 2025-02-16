import {promises as fs} from 'fs';
import path, {dirname} from 'path';
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function validateJSONL(filePath, schema = null) {
    try {
        // Read the file content
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        const results = {
            totalLines: lines.length, validLines: 0, invalidLines: [],
        };

        // Validate each line
        lines.forEach((line, index) => {
            try {
                const parsedLine = JSON.parse(line);

                // If schema is provided, validate against it
                if (schema) {
                    const isValid = validateAgainstSchema(parsedLine, schema);
                    if (!isValid) {
                        results.invalidLines.push({
                            line: index + 1, content: line, error: 'Failed schema validation'
                        });
                        return;
                    }
                }

                results.validLines++;
            } catch (err) {
                results.invalidLines.push({
                    line: index + 1, content: line, error: err.message
                });
            }
        });

        return results;
    } catch (err) {
        throw new Error(`Failed to read file: ${err.message}`);
    }
}


// More detailed schema validation function
function validateAgainstSchema(data, schema) {
    if (!Array.isArray(data.messages)) return false;

    return data.messages.every(message => {
        return (typeof message === 'object' && typeof message.role === 'string' && typeof message.content === 'string' && ['system', 'user', 'assistant'].includes(message.role));
    });
}

// Example usage
async function main() {
    const filePath = path.join(__dirname, 'hn-companion-training-data-all.jsonl');

    // Optional schema definition
    const schema = {
        messages: 'object',
    };

    try {
        const results = await validateJSONL(filePath, schema);
        console.log('Validation Results:', JSON.stringify(results, null, 2));
    } catch (err) {
        console.error('Validation failed:', err.message);
    }
}

main();