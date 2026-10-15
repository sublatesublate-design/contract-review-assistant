import type { ThinkingCapabilities, ThinkingEffort } from '../types/settings';

const levels: ThinkingEffort[] = ['low', 'medium', 'high'];
const full: ThinkingEffort[] = [...levels, 'xhigh', 'max'];

export function getLocalThinkingCapabilities(provider: string, model: string): ThinkingCapabilities {
    const id = model.trim();
    let efforts: ThinkingEffort[] | undefined;
    let budgetTokens: ThinkingCapabilities['budgetTokens'];
    let note = '选择的等级会随请求发送；不同厂商的同名等级不代表相同 token 用量。';
    if (provider === 'claude') {
        if (/^claude-(opus|sonnet)-5-5(?:-\d{8})?$/.test(id)) efforts = full;
        else if (/^claude-haiku-5-5(?:-\d{8})?$/.test(id)) efforts = levels;
        else if (/^claude-opus-4-6(?:-\d{8})?$/.test(id)) efforts = [...levels, 'max'];
        else if (/^claude-sonnet-4-6(?:-\d{8})?$/.test(id)) efforts = levels;
    } else if (provider === 'openai') {
        if (/^gpt-(6-astra|6\.1-sol|6-sol|6-luna)(?:-\d{4}-\d{2}-\d{2})?$/.test(id)) efforts = full;
        else if (/^gpt-5\.1(?:-\d{4}-\d{2}-\d{2})?$/.test(id)) efforts = levels;
        else if (/^gpt-5\.[24](?:-\d{4}-\d{2}-\d{2})?$/.test(id)) efforts = [...levels, 'xhigh'];
        else if (/^(gpt-5(?:-mini|-nano)?|o[134](?:-mini)?)(?:-\d{4}-\d{2}-\d{2})?$/.test(id)) efforts = levels;
        else if (/^deepseek-(v4(?:\.1)?-(?:pro|flash)(?:-\d{4})?|flash)$/.test(id)
            || /^kimi-k3(?:-\d{4})?$/.test(id) || /^glm-5\.3(?:-flash)?$/.test(id)) efforts = ['low', 'high', 'max'];
        else if (/^qwen3\.[5678]-(max|plus|flash)(?:-\d{4}-\d{2}-\d{2}|-\d{4})?$/.test(id)) {
            efforts = levels;
            budgetTokens = { min: 1, max: 32768 };
            note = '低／中／高映射为 2048／8192／32768 token 思考预算；也可手填预算，与等级预设二选一。';
        } else if (/^gemini-2\.5-(pro|flash|flash-lite)(?:-preview-\d{2}-\d{2})?$/.test(id)) efforts = levels;
        else if (/^gemini-3(?:\.1)?-pro(?:-preview)?$/.test(id)) efforts = id.startsWith('gemini-3.1') ? levels : ['low', 'high'];
        else if (/^gemini-3(?:\.[157])?-flash(?:-lite)?(?:-preview)?$/.test(id)) efforts = levels;
        else if (/^grok-4\.[56]$/.test(id)) efforts = id === 'grok-4.6' ? [...levels, 'xhigh'] : levels;
        else if (id === 'MiniMax-M3.1-Flash-Preview' || /^doubao-seed-2-1-(pro|turbo)-260628$/.test(id)) efforts = full;
        else if (id === 'step-3.5-flash-2603') efforts = ['low', 'high'];
        else if (/^mimo-v2\.(5(?:-pro)?|6-(?:flash|pro|pro-ultraspeed))$/.test(id)
            || /^MiniMax-M2(?:\.[1257])?(?:-highspeed)?$/.test(id) || id === 'MiniMax-M3'
            || /^deepseek-(reasoner|r1)$/.test(id) || /^kimi-k2\.(5|6)$/.test(id)
            || /^grok-4(?:-0709|-fast-reasoning|-1-fast-reasoning)?$/.test(id)
            || id === 'step-3.5-flash' || /^hunyuan-(2\.0-thinking|t1(?:-latest)?)$/.test(id)) efforts = [];
    } else if (provider === 'ollama') {
        if (/^gpt-oss(?::|$)/.test(id)) efforts = levels;
        else if (/^(qwen3(?:\.[568])?|deepseek-r1)(?::|$)/.test(id)) efforts = [];
    }
    if (efforts === undefined) return {
        modes: ['auto'], efforts: ['auto'],
        note: '此型号暂未适配等级调节，保留接口默认行为，不猜测参数。',
    };
    return {
        modes: ['auto', 'enabled'], efforts: ['auto', ...efforts],
        ...(budgetTokens ? { budgetTokens } : {}),
        note: efforts.length ? note : '此型号没有已核验的等级或预算参数，保留默认思考，不虚设可调等级。',
    };
}
