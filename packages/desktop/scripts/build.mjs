import fs from 'fs';
import path from 'path';
import shell from 'shelljs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '../../..');
const desktopRoot = path.resolve(__dirname, '..');
const serverRoot = path.resolve(projectRoot, 'packages/server');
const serverDist = path.resolve(serverRoot, 'dist');
const serverTemplateAssetsRoots = [
    path.resolve(serverRoot, 'assets', 'templates'),
    path.resolve(serverRoot, 'src', 'assets', 'templates'),
];
const addinRoot = path.resolve(projectRoot, 'packages/addin');
const addinDist = path.resolve(addinRoot, 'dist');
const wpsAddinRoot = path.resolve(addinRoot, 'wps-addin');
const exeOutDir = path.resolve(desktopRoot, 'out');

function run(command, cwd) {
    shell.cd(cwd);
    const result = shell.exec(command);
    if (result.code !== 0) {
        throw new Error(`Command failed: ${command}`);
    }
}

function copyPackagedAssets() {
    const publicDir = path.resolve(serverDist, 'public');
    const packagedWpsDir = path.resolve(publicDir, 'wps-addin');
    const packagedTemplateDir = path.resolve(serverDist, 'assets', 'templates');

    shell.rm('-rf', publicDir);
    shell.mkdir('-p', publicDir);
    shell.cp('-R', path.join(addinDist, '*'), publicDir);

    shell.mkdir('-p', packagedWpsDir);
    shell.cp('-R', path.join(wpsAddinRoot, '*'), packagedWpsDir);

    const serverTemplateAssetsRoot = serverTemplateAssetsRoots.find((dir) => fs.existsSync(dir));
    if (serverTemplateAssetsRoot) {
        shell.mkdir('-p', packagedTemplateDir);
        for (const entry of fs.readdirSync(serverTemplateAssetsRoot, { withFileTypes: true })) {
            if (entry.name.startsWith('~$') || entry.name.endsWith('.tmp')) {
                continue;
            }

            const sourcePath = path.join(serverTemplateAssetsRoot, entry.name);
            if (entry.isDirectory()) {
                shell.cp('-R', sourcePath, packagedTemplateDir);
            } else {
                shell.cp(sourcePath, packagedTemplateDir);
            }
        }
    }
}

function packageServerExe() {
    const serverPkgJsonPath = path.resolve(serverRoot, 'package.json');
    const originalServerPkgText = fs.readFileSync(serverPkgJsonPath, 'utf8');
    const originalServerPkg = JSON.parse(originalServerPkgText);

    const packagedServerPkg = {
        ...originalServerPkg,
        bin: 'dist/index.js',
        pkg: {
            scripts: 'dist/**/*.js',
            assets: [
                'dist/public/**/*',
                'dist/assets/templates/**/*',
            ],
            targets: ['node20-win-x64'],
        },
    };

    fs.writeFileSync(serverPkgJsonPath, `${JSON.stringify(packagedServerPkg, null, 2)}\n`);

    try {
        run(
            `cmd /c npx pkg "${serverPkgJsonPath}" --output "${path.join(exeOutDir, 'ContractReviewAssistant.exe')}" --compress GZip`,
            desktopRoot
        );
    } finally {
        fs.writeFileSync(serverPkgJsonPath, originalServerPkgText);
    }
}

function main() {
    console.log('Building desktop package...');
    shell.rm('-rf', exeOutDir);
    shell.mkdir('-p', exeOutDir);

    run('cmd /c npm run build:addin', projectRoot);
    run('cmd /c npm run build:server', projectRoot);
    copyPackagedAssets();
    packageServerExe();

    console.log(`Desktop EXE created: ${path.join(exeOutDir, 'ContractReviewAssistant.exe')}`);
}

main();
