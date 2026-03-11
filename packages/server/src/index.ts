import 'dotenv/config';
import fs from 'fs';
import https, { type ServerOptions } from 'https';
import os from 'os';
import path from 'path';
import { createApp } from './app';

type ProcessWithPkg = NodeJS.Process & { pkg?: unknown };

const processWithPkg = process as ProcessWithPkg;
const isDesktopMode =
    Boolean(processWithPkg.pkg) ||
    process.argv.includes('--desktop') ||
    process.argv.includes('--desktop-server') ||
    !!process.env['DESKTOP_MODE'];
const PORT = isDesktopMode ? 3000 : parseInt(process.env['PORT'] ?? '3001', 10);

const HEALTHCHECK_TIMEOUT_MS = 3000;
const DESKTOP_LOG_DIR_NAME = 'logs';
const DESKTOP_LOG_FILE_NAME = 'desktop.log';

function getDesktopStateDir(): string {
    const homeDir = os.userInfo().homedir;
    return process.env['APPDATA']
        ? path.join(process.env['APPDATA'], 'ContractReviewAssistant')
        : path.join(homeDir, '.contract-review-assistant');
}

function getDesktopLogPath(): string {
    return path.join(getDesktopStateDir(), DESKTOP_LOG_DIR_NAME, DESKTOP_LOG_FILE_NAME);
}

function formatLogError(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    return String(error);
}

function writeDesktopLog(message: string, error?: unknown): void {
    if (!isDesktopMode) {
        return;
    }

    const logPath = getDesktopLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });

    const parts = [
        `[${new Date().toISOString()}]`,
        `[pid:${process.pid}]`,
        message,
    ];

    if (error !== undefined) {
        parts.push(formatLogError(error));
    }

    fs.appendFileSync(logPath, `${parts.join(' ')}\n`);
}

function resolveDesktopHttpsOptions(): ServerOptions {
    const homeDir = os.userInfo().homedir;
    const managedCertDir = process.env['APPDATA']
        ? path.join(process.env['APPDATA'], 'ContractReviewAssistant', 'certs')
        : path.join(homeDir, '.office-addin-dev-certs');
    const devCertDir = path.join(homeDir, '.office-addin-dev-certs');

    const managedKeyPath = path.join(managedCertDir, 'localhost.key');
    const managedCertPath = path.join(managedCertDir, 'localhost.crt');
    const managedPfxPath = path.join(managedCertDir, 'localhost.pfx');
    const devKeyPath = path.join(devCertDir, 'localhost.key');
    const devCertPath = path.join(devCertDir, 'localhost.crt');

    if (fs.existsSync(managedKeyPath) && fs.existsSync(managedCertPath)) {
        return {
            key: fs.readFileSync(managedKeyPath),
            cert: fs.readFileSync(managedCertPath),
        };
    }

    if (fs.existsSync(managedPfxPath)) {
        return {
            pfx: fs.readFileSync(managedPfxPath),
            passphrase: 'contract-review',
        };
    }

    if (fs.existsSync(devKeyPath) && fs.existsSync(devCertPath)) {
        return {
            key: fs.readFileSync(devKeyPath),
            cert: fs.readFileSync(devCertPath),
        };
    }

    throw new Error(
        `No HTTPS certificate found. Checked ${managedCertDir} and ${devCertDir}.`
    );
}

function checkDesktopServerHealth(): Promise<boolean> {
    return new Promise((resolve) => {
        const req = https.request(
            {
                hostname: 'localhost',
                port: PORT,
                path: '/health',
                method: 'GET',
                rejectUnauthorized: false,
            },
            (res) => {
                const isHealthy = res.statusCode === 200;
                res.resume();
                resolve(isHealthy);
            }
        );

        req.setTimeout(HEALTHCHECK_TIMEOUT_MS, () => {
            req.destroy(new Error('timeout'));
        });

        req.on('error', () => {
            resolve(false);
        });

        req.end();
    });
}

function startDesktopServer(): void {
    const app = createApp();
    writeDesktopLog('Desktop server process starting');

    try {
        const options = resolveDesktopHttpsOptions();
        const server = https.createServer(options, app);

        server.on('error', async (error) => {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'EADDRINUSE' && await checkDesktopServerHealth()) {
                writeDesktopLog('Desktop server found an existing listener on port 3000');
                console.log('Desktop server already active');
                process.exit(0);
            }
            writeDesktopLog('Desktop server failed to start', err);
            console.error('Failed to start desktop server.', err);
            process.exit(1);
        });

        server.listen(PORT, () => {
            writeDesktopLog('Desktop server is listening');
            console.log('Desktop server started');
            console.log(`HTTPS: https://localhost:${PORT}`);
            console.log(`Word taskpane: https://localhost:${PORT}/taskpane.html`);
            console.log(`WPS taskpane: https://localhost:${PORT}/taskpane-wps.html`);
        });
    } catch (err) {
        writeDesktopLog('Failed to load desktop HTTPS certificates', err);
        console.error('Failed to load desktop HTTPS certificates.', err);
        process.exit(1);
    }
}

function startApiServer(): void {
    const app = createApp();
    app.listen(PORT, () => {
        console.log('API server started');
        console.log(`HTTP: http://localhost:${PORT}`);
        console.log(`Health: http://localhost:${PORT}/health`);
    });
}

if (isDesktopMode) {
    startDesktopServer();
} else {
    startApiServer();
}
