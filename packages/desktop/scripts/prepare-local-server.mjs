import fs from 'fs';
import path from 'path';
import shell from 'shelljs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '../../..');
const addinRoot = path.resolve(projectRoot, 'packages/addin');
const addinDist = path.resolve(addinRoot, 'dist');
const wpsAddinRoot = path.resolve(addinRoot, 'wps-addin');
const serverRoot = path.resolve(projectRoot, 'packages/server');
const serverDist = path.resolve(serverRoot, 'dist');
const publicDir = path.resolve(serverDist, 'public');
const publicWpsDir = path.resolve(publicDir, 'wps-addin');
const templateSourceCandidates = [
    path.resolve(serverRoot, 'assets', 'templates'),
    path.resolve(serverRoot, 'src', 'assets', 'templates'),
];
const templateTargetDir = path.resolve(serverDist, 'assets', 'templates');

function ensureExists(targetPath, label) {
    if (!fs.existsSync(targetPath)) {
        throw new Error(`${label} not found: ${targetPath}`);
    }
}

function copyDirectoryContents(sourceDir, targetDir) {
    shell.rm('-rf', targetDir);
    shell.mkdir('-p', targetDir);
    shell.cp('-R', path.join(sourceDir, '*'), targetDir);
}

function copyTemplates() {
    const templateSource = templateSourceCandidates.find((candidate) => fs.existsSync(candidate));
    if (!templateSource) {
        return;
    }

    shell.mkdir('-p', templateTargetDir);
    for (const entry of fs.readdirSync(templateSource, { withFileTypes: true })) {
        if (entry.name.startsWith('~$') || entry.name.endsWith('.tmp')) {
            continue;
        }
        const sourcePath = path.join(templateSource, entry.name);
        if (entry.isDirectory()) {
            shell.cp('-R', sourcePath, templateTargetDir);
        } else {
            shell.cp(sourcePath, templateTargetDir);
        }
    }
}

function main() {
    ensureExists(addinDist, 'Add-in dist directory');
    ensureExists(serverDist, 'Server dist directory');
    ensureExists(wpsAddinRoot, 'WPS add-in directory');

    copyDirectoryContents(addinDist, publicDir);
    copyDirectoryContents(wpsAddinRoot, publicWpsDir);
    copyTemplates();

    console.log(`Prepared local desktop server assets in ${publicDir}`);
}

main();
