/**
 * wps-register.mjs
 * WPS 插件注册脚本（开发模式）。
 *
 * 复用 exe 安装包的注册方式：写入 publish.xml，
 * 插件 URL 指向 webpack dev server (https://localhost:3000/wps-addin/)。
 * 不依赖 wpsjs，不启动额外服务。
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ADDIN_NAME = 'contract-review-wps';
const ADDIN_URL = 'https://localhost:3000/wps-addin/';

// ── 1. 通过 PowerShell 配置 oem.ini（启用 JS 插件）──
function configOemIni() {
    try {
        // 用 PowerShell 查注册表获取 WPS office6 路径（正确处理 Unicode）
        const psCmd = `(Get-ItemProperty -Path 'Registry::HKEY_CLASSES_ROOT\\KWPS.Document.12\\shell\\open\\command' -Name '(default)').'(default)'`;
        const raw = execSync(`powershell -NoProfile -Command "${psCmd}"`, { encoding: 'utf8' }).trim();
        const match = raw.match(/^"?(.+?[/\\]office6)[/\\]/i) || raw.match(/^(.+?[/\\]office6)[/\\]/i);

        let office6Path = null;
        if (match) {
            office6Path = match[1];
        } else {
            // 回退：尝试从 LOCALAPPDATA 猜测
            const localApp = process.env.LOCALAPPDATA;
            if (localApp) {
                const kingsoftDir = path.join(localApp, 'Kingsoft', 'WPS Office');
                if (fs.existsSync(kingsoftDir)) {
                    const versions = fs.readdirSync(kingsoftDir).filter(d => /^\d/.test(d)).sort().reverse();
                    for (const v of versions) {
                        const o6 = path.join(kingsoftDir, v, 'office6');
                        if (fs.existsSync(o6)) { office6Path = o6; break; }
                    }
                }
            }
        }

        if (!office6Path) {
            console.log('  [跳过] 未找到 WPS office6 路径，跳过 oem.ini 配置');
            return;
        }

        const cfgsDir = path.join(office6Path, 'cfgs');
        const oemPath = path.join(cfgsDir, 'oem.ini');

        if (!fs.existsSync(cfgsDir)) {
            fs.mkdirSync(cfgsDir, { recursive: true });
        }

        let content = '';
        if (fs.existsSync(oemPath)) {
            content = fs.readFileSync(oemPath, 'utf-8');
        }

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
    } catch (e) {
        console.log(`  [跳过] oem.ini 配置失败（非致命）: ${e.message}`);
    }
}

// ── 2. 写入 publish.xml（与 exe 安装包相同的注册方式）──
function writePublishXml() {
    const jsaddonsDir = path.join(process.env.APPDATA, 'kingsoft', 'wps', 'jsaddons');
    const publishPath = path.join(jsaddonsDir, 'publish.xml');

    if (!fs.existsSync(jsaddonsDir)) {
        fs.mkdirSync(jsaddonsDir, { recursive: true });
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<jsplugins>
  <jspluginonline name="${ADDIN_NAME}" type="wps" url="${ADDIN_URL}" debug="" enable="enable_dev" install="null"/>
</jsplugins>`;

    fs.writeFileSync(publishPath, xml, 'utf-8');
    console.log(`  [OK] publish.xml 已注册: ${publishPath}`);
    console.log(`  [OK] 插件 URL: ${ADDIN_URL}`);
}

// ── 主流程 ──
function main() {
    configOemIni();
    writePublishXml();
    console.log('  [完成] WPS 插件注册完毕，请完全退出 WPS 后重新打开');
}

main();
