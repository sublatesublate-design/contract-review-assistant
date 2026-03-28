import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templateRoot = path.resolve(__dirname, '..', 'assets', 'templates');
const manifestRoot = path.resolve(templateRoot, 'manifests');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectTokens(docxBuffer) {
    const zip = new PizZip(docxBuffer);
    const tokens = new Set();

    for (const file of zip.file(/word\/.+\.xml$/)) {
        if (file.name.startsWith('word/_rels/')) continue;
        const xml = file.asText();
        for (const token of xml.match(/{{[^{}]+}}/g) ?? []) {
            tokens.add(token);
        }
    }

    return [...tokens].sort();
}

function validateOne(manifestFile) {
    const manifestPath = path.join(manifestRoot, manifestFile);
    const manifest = readJson(manifestPath);
    const templatePath = path.join(templateRoot, manifest.templateFile);

    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template not found for ${manifestFile}: ${templatePath}`);
    }

    const templateTokens = collectTokens(fs.readFileSync(templatePath));
    const manifestTokens = manifest.fields.map((field) => `{{${field.key}}}`).sort();

    if (JSON.stringify(templateTokens) !== JSON.stringify(manifestTokens)) {
        throw new Error(
            `Placeholder mismatch for ${manifestFile}\n` +
            `template: ${templateTokens.join(', ')}\n` +
            `manifest: ${manifestTokens.join(', ')}`
        );
    }

    return {
        manifestFile,
        label: manifest.label,
        fieldCount: manifest.fields.length,
        templateFile: manifest.templateFile,
    };
}

function main() {
    if (!fs.existsSync(templateRoot) || !fs.existsSync(manifestRoot)) {
        throw new Error(`Template asset directories are missing under ${templateRoot}`);
    }

    const manifestFiles = fs.readdirSync(manifestRoot).filter((file) => file.endsWith('.json')).sort();
    if (manifestFiles.length === 0) {
        throw new Error('No manifest files found.');
    }

    const summaries = manifestFiles.map(validateOne);
    console.log('Derived template assets validated successfully.');
    for (const summary of summaries) {
        console.log(`- ${summary.manifestFile}: ${summary.label} (${summary.fieldCount} fields) -> ${summary.templateFile}`);
    }
    console.log('');
    console.log('This script audits the derived official templates after placeholder insertion.');
    console.log('It is intended for offline maintenance, not runtime generation.');
}

main();
