import os from 'os';
import path from 'path';

export function getStateRoot(): string {
    const homeDir = os.userInfo().homedir;
    return process.env['APPDATA']
        ? path.join(process.env['APPDATA'], 'ContractReviewAssistant')
        : path.join(homeDir, '.contract-review-assistant');
}
