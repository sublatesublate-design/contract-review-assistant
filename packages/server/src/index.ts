import 'dotenv/config';
import { createApp } from './app';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';

const isDesktop = !!process.env['DESKTOP_MODE'];
// 桌面打包模式下固定使用 3000 端口（与 manifest 一致）
const PORT = isDesktop ? 3000 : parseInt(process.env['PORT'] ?? '3001', 10);

const app = createApp();

if (isDesktop) {
    // 桌面模式：读取 office-addin-dev-certs 生成的证书（仅供测试验证）
    // 最终打包时，这里会读取我们自己生成的自签名证书
    try {
        const homeDir = os.userInfo().homedir;
        const keyPath = path.join(homeDir, '.office-addin-dev-certs', 'localhost.key');
        const certPath = path.join(homeDir, '.office-addin-dev-certs', 'localhost.crt');

        const options = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
        };

        https.createServer(options, app).listen(PORT, () => {
            console.log(`✅ 合同审查助手 (桌面模式) 已启动`);
            console.log(`   服务地址 (HTTPS): https://localhost:${PORT}`);
            console.log(`   访问前端界面: https://localhost:${PORT}/taskpane.html`);
            console.log(`   环境: ${process.env['NODE_ENV'] ?? 'development'}`);
        });
    } catch (err) {
        console.error('❌ 加载 HTTPS 证书失败！请确保已安装 office-addin-dev-certs', err);
        process.exit(1);
    }
} else {
    // 默认模式：HTTP
    app.listen(PORT, () => {
        console.log(`✅ 合同审查助手后端 API 已启动`);
        console.log(`   地址: http://localhost:${PORT}`);
        console.log(`   健康检查: http://localhost:${PORT}/health`);
        console.log(`   环境: ${process.env['NODE_ENV'] ?? 'development'}`);
    });
}
