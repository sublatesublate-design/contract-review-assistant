/**
 * wps-register.mjs
 * 绕过 wpsjs 的 WPS 插件注册脚本。
 * 解决 wpsjs 在中文 Windows 用户名下因编码问题导致注册失败的 bug。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3889;

// ── 1. 通过 PowerShell 查注册表获取 WPS office6 路径（正确处理 Unicode）──
function getWpsOffice6Path() {
    try {
        const psCmd = `(Get-ItemProperty -Path 'Registry::HKEY_CLASSES_ROOT\\KWPS.Document.12\\shell\\open\\command' -Name '(default)').'(default)'`;
        const raw = execSync(`powershell -NoProfile -Command "${psCmd}"`, { encoding: 'utf8' }).trim();
        // raw 类似: "C:\Users\寸又木\AppData\Local\Kingsoft\WPS Office\12.1.0.25225\office6\wps.exe" "%1"
        const match = raw.match(/^"?(.+?[/\\]office6)[/\\]/i) || raw.match(/^(.+?[/\\]office6)[/\\]/i);
        if (match) return match[1];
    } catch (e) {
        // ignore
    }

    // 回退：尝试从 LOCALAPPDATA 猜测路径
    const localApp = process.env.LOCALAPPDATA;
    if (localApp) {
        const kingsoftDir = path.join(localApp, 'Kingsoft', 'WPS Office');
        if (fs.existsSync(kingsoftDir)) {
            const versions = fs.readdirSync(kingsoftDir).filter(d => /^\d/.test(d)).sort().reverse();
            for (const v of versions) {
                const office6 = path.join(kingsoftDir, v, 'office6');
                if (fs.existsSync(office6)) return office6;
            }
        }
    }

    throw new Error('找不到 WPS 安装路径，请确认已安装 WPS Office');
}

// ── 2. 配置 oem.ini（启用 JS 插件）──
function configOemIni(office6Path) {
    const cfgsDir = path.join(office6Path, 'cfgs');
    const oemPath = path.join(cfgsDir, 'oem.ini');

    if (!fs.existsSync(cfgsDir)) {
        fs.mkdirSync(cfgsDir, { recursive: true });
    }

    let content = '';
    if (fs.existsSync(oemPath)) {
        content = fs.readFileSync(oemPath, 'utf-8');
    }

    // 确保 [Support] 段存在且包含必要配置
    let modified = false;

    if (!content.includes('[Support]')) {
        content += '\n[Support]\n';
        modified = true;
    }
    if (!content.includes('JsApiPlugin')) {
        content = content.replace('[Support]', '[Support]\nJsApiPlugin=true');
        modified = true;
    }
    if (!content.includes('JsApiShowWebDebugger')) {
        content = content.replace('[Support]', '[Support]\nJsApiShowWebDebugger=true');
        modified = true;
    }

    if (modified) {
        fs.writeFileSync(oemPath, content, 'utf-8');
    }
    console.log(`  [OK] oem.ini 已配置: ${oemPath}`);
}

// ── 3. 写入 jsplugins.xml（注册插件）──
function writeJspluginsXml() {
    const jsaddonsDir = path.join(process.env.APPDATA, 'kingsoft', 'wps', 'jsaddons');
    const xmlPath = path.join(jsaddonsDir, 'jsplugins.xml');

    if (!fs.existsSync(jsaddonsDir)) {
        fs.mkdirSync(jsaddonsDir, { recursive: true });
    }

    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<jsplugins>
  <jspluginonline name="contract-review-wps" type="wps" url="http://127.0.0.1:${PORT}/"/>
</jsplugins>`;

    fs.writeFileSync(xmlPath, xml, 'utf-8');
    console.log(`  [OK] jsplugins.xml 已注册: ${xmlPath}`);
}

// ── 4. 启动静态文件服务器（端口 3889）──
function startServer() {
    const rootDir = __dirname;

    const MIME = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.xml': 'text/xml; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
    };

    const server = http.createServer((req, res) => {
        let urlPath = req.url.split('?')[0];
        if (urlPath === '/') urlPath = '/index.html';

        // 提供 jsplugins.xml
        if (urlPath === '/jsplugins.xml') {
            const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<jsplugins>
  <jspluginonline name="contract-review-wps" type="wps" url="http://127.0.0.1:${PORT}/"/>
</jsplugins>`;
            res.writeHead(200, { 'Content-Type': 'text/xml' });
            res.end(xml);
            return;
        }

        const filePath = path.join(rootDir, urlPath);
        if (!fs.existsSync(filePath)) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }

        const ext = path.extname(filePath);
        const contentType = MIME[ext] || 'application/octet-stream';
        const data = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
        res.end(data);
    });

    server.listen(PORT, () => {
        console.log(`  [OK] WPS 插件服务已启动: http://127.0.0.1:${PORT}`);
    });

    server.on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
            console.log(`  [提示] 端口 ${PORT} 已被占用，插件服务可能已在运行`);
        } else {
            console.error('  [错误] 插件服务启动失败:', e.message);
        }
    });
}

// ── 主流程 ──
function main() {
    try {
        const office6 = getWpsOffice6Path();
        console.log(`  [OK] WPS 路径: ${office6}`);
        configOemIni(office6);
        writeJspluginsXml();
        startServer();
    } catch (e) {
        console.error(`  [错误] ${e.message}`);
        process.exit(1);
    }
}

main();
