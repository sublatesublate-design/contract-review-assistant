import shell from 'shelljs';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { generateCertKeys } from './generate-cert.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');
const desktopRoot = path.resolve(__dirname, '..');
const serverRoot = path.resolve(projectRoot, 'packages/server');
const serverDist = path.resolve(serverRoot, 'dist');
const addinRoot = path.resolve(projectRoot, 'packages/addin');
const addinDist = path.resolve(addinRoot, 'dist');
const exeOutDir = path.resolve(desktopRoot, 'out');

console.log('🚀 开始构建合同审查助手桌面版...');

// 0. 清理旧构建
shell.rm('-rf', exeOutDir);
shell.mkdir('-p', exeOutDir);

// 1. 构建前端
console.log('\n📦 1/5 正在构建前端界面 (addin)...');
shell.cd(projectRoot);
if (shell.exec('pnpm build:addin').code !== 0) {
    console.error('❌ 前端构建失败');
    process.exit(1);
}

// 2. 构建后端
console.log('\n⚙️ 2/5 正在构建后端服务 (server)...');
shell.cd(projectRoot);
if (shell.exec('pnpm build:server').code !== 0) {
    console.error('❌ 后端构建失败');
    process.exit(1);
}

// 3. 复制前端产物到后端 dist/public
console.log('\n📂 3/5 正在合并前后端产物...');
const publicDir = path.resolve(serverDist, 'public');
shell.rm('-rf', publicDir);
shell.mkdir('-p', publicDir);
shell.cp('-R', path.join(addinDist, '*'), publicDir);

// 此时还需要修改 index.js 让 pkg 正确识别虚拟文件系统的路径
// 将原本读取 userHome 证书的代码，改成从虚拟文件或 appData 读取
console.log('\n🔐 4/5 正在处理 HTTPS 证书路径逻辑...');
const indexJsPath = path.resolve(serverDist, 'index.js');
let indexJsContent = fs.readFileSync(indexJsPath, 'utf8');
// 将原来的 .office-addin-dev-certs 替换为我们要放在 APPDATA 里的路径
indexJsContent = indexJsContent.replace(
    /path\.join\(homeDir, '\.office-addin-dev-certs', 'localhost\.key'\)/g,
    "path.join(process.env.APPDATA || homeDir, 'ContractReviewAssistant', 'certs', 'localhost.key')"
).replace(
    /path\.join\(homeDir, '\.office-addin-dev-certs', 'localhost\.crt'\)/g,
    "path.join(process.env.APPDATA || homeDir, 'ContractReviewAssistant', 'certs', 'localhost.crt')"
);
fs.writeFileSync(indexJsPath, indexJsContent);

// 5. 组装 exe
console.log('\n⚡ 5/5 正在使用 pkg 打包为独立 EXE...');
shell.cd(desktopRoot);

// 我们需要在 server 的 package.json 里声明 bin 和 pkg 配置才能正确打包
const serverPkgJsonPath = path.resolve(serverRoot, 'package.json');
const originalServerPkg = JSON.parse(fs.readFileSync(serverPkgJsonPath, 'utf8'));

const modifiedServerPkg = {
    ...originalServerPkg,
    bin: "dist/index.js",
    pkg: {
        scripts: "dist/**/*.js",
        assets: [
            "dist/public/**/*"
        ],
        targets: ["node20-win-x64"]
    }
};

fs.writeFileSync(serverPkgJsonPath, JSON.stringify(modifiedServerPkg, null, 2));

// 执行 pkg
console.log('  > 执行 pkg...');
if (shell.exec(`npx pkg ${serverPkgJsonPath} --output ${path.join(exeOutDir, 'ContractReviewAssistant.exe')} --compress GZip`).code !== 0) {
    console.error('❌ pkg 打包失败');
    // 恢复原来的 package.json
    fs.writeFileSync(serverPkgJsonPath, JSON.stringify(originalServerPkg, null, 2));
    process.exit(1);
}

// 恢复 package.json
fs.writeFileSync(serverPkgJsonPath, JSON.stringify(originalServerPkg, null, 2));

console.log(`\n✅ 构建成功！EXE 已生成在: ${path.join(exeOutDir, 'ContractReviewAssistant.exe')}`);
