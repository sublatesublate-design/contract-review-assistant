import { z } from 'zod';

export const ThinkingConfigSchema = z.object({
    mode: z.enum(['auto', 'enabled', 'disabled']).default('auto'),
    effort: z.enum(['auto', 'low', 'medium', 'high', 'xhigh', 'max']).default('auto'),
    budgetTokens: z.number().int().min(1).max(32768).optional(),
}).strict();

export type ThinkingConfig = z.infer<typeof ThinkingConfigSchema>;
type Mode = ThinkingConfig['mode'];
type Effort = ThinkingConfig['effort'];
type Style = 'none' | 'fixed' | 'openai' | 'switch' | 'deepseek' | 'effort' | 'glm' | 'qwen' | 'claude-adaptive' | 'claude-effort' | 'ollama-switch' | 'ollama-effort' | 'minimax-adaptive' | 'minimax-fixed' | 'doubao';

interface ThinkingProfile {
    modes: Mode[];
    efforts: Effort[];
    note: string;
    style: Style;
    defaultEffort?: Effort;
}

function profile(style: Style, canDisable: boolean, efforts: Effort[], note: string, defaultEffort?: Effort): ThinkingProfile {
    return {
        style, modes: canDisable ? ['auto', 'enabled', 'disabled'] : ['auto', 'enabled'],
        efforts: ['auto', ...efforts], note,
        ...(defaultEffort ? { defaultEffort } : {}),
    };
}

function unknown(note: string): ThinkingProfile {
    return { style: 'none', modes: ['auto'], efforts: ['auto'], note };
}

function getProfile(provider: string, model: string): ThinkingProfile {
    if (provider === 'claude') {
        if (/^claude-opus-5-5(?:-\d{8})?$/.test(model)) {
            return profile('claude-effort', false, ['low', 'medium', 'high', 'xhigh', 'max'], '始终思考，不能关闭；仅通过 effort 调强度。');
        }
        if (/^claude-sonnet-5-5(?:-\d{8})?$/.test(model)) {
            return profile('claude-adaptive', false, ['low', 'medium', 'high', 'xhigh', 'max'], '默认自适应思考，不能完全关闭；between_tools 不等于关闭。');
        }
        if (/^claude-haiku-5-5(?:-\d{8})?$/.test(model)) {
            return profile('claude-adaptive', true, ['low', 'medium', 'high'], '默认自适应思考；支持关闭，关闭时不发送等级。');
        }
        if (/^claude-(opus|sonnet)-4-6(?:-\d{8})?$/.test(model)) {
            return profile('claude-adaptive', true, model.startsWith('claude-opus') ? ['low', 'medium', 'high', 'max'] : ['low', 'medium', 'high'], '默认启用自适应思考，等级通过 output_config.effort 传递。');
        }
    } else if (provider === 'openai') {
        if (/^gpt-(6-astra|6\.1-sol)(?:-\d{4}-\d{2}-\d{2})?$/.test(model)) {
            return profile('openai', false, ['low', 'medium', 'high', 'xhigh', 'max'], '始终思考，不支持 none；推荐中等级。', 'medium');
        }
        if (/^gpt-6-(sol|luna)(?:-\d{4}-\d{2}-\d{2})?$/.test(model)) {
            return profile('openai', true, ['low', 'medium', 'high', 'xhigh', 'max'], '默认开启中等级思考，关闭时使用 none。', 'medium');
        }
        if (/^gpt-5\.1(?:-\d{4}-\d{2}-\d{2})?$/.test(model)) {
            return profile('openai', true, ['low', 'medium', 'high'], '默认开启中等级思考；不支持极高等级，关闭时使用 none。', 'medium');
        }
        if (/^gpt-5\.[24](?:-\d{4}-\d{2}-\d{2})?$/.test(model)) {
            return profile('openai', true, ['low', 'medium', 'high', 'xhigh'], '默认开启中等级思考，关闭时使用 none。', 'medium');
        }
        if (/^(gpt-5(?:-mini|-nano)?|o[134](?:-mini)?)(?:-\d{4}-\d{2}-\d{2})?$/.test(model)) {
            return profile('openai', false, ['low', 'medium', 'high'], '推理型号默认开启思考；不能完全关闭，可调低等级。', 'medium');
        }
        if (/^mimo-v2\.(5(?:-pro)?|6-(?:flash|pro|pro-ultraspeed))$/.test(model)) {
            return profile('switch', true, [], '默认开启思考；仅核验开关，未提供独立等级，不虚设等级。');
        }
        if (/^deepseek-(v4(?:\.1)?-(?:pro|flash)(?:-\d{4})?|flash)$/.test(model)) {
            return profile('deepseek', true, ['low', 'high', 'max'], '默认开启思考；原生等级为低、高、最高，总生成额度包含思考和正文。');
        }
        if (/^deepseek-(reasoner|r1)$/.test(model)) {
            return profile('fixed', false, [], '固定推理型号，保留其思考行为；未核验独立等级。');
        }
        if (/^kimi-k3(?:-\d{4})?$/.test(model)) {
            return profile('effort', false, ['low', 'high', 'max'], '始终思考，不能关闭；支持低、高、最高等级。');
        }
        if (/^kimi-k2\.(5|6)$/.test(model)) {
            return profile('switch', true, [], '默认开启思考，可关闭；未核验原生 effort 等级。');
        }
        if (/^glm-5\.3(?:-flash)?$/.test(model)) {
            return profile('glm', false, ['low', 'high', 'max'], '始终思考，不支持关闭；可用低等级降低开销。');
        }
        if (/^qwen3\.[5678]-(max|plus|flash)(?:-\d{4}-\d{2}-\d{2}|-\d{4})?$/.test(model)) {
            return profile('qwen', true, ['low', 'medium', 'high'], '默认开启思考；等级映射预算：低 2048、中 8192、高 32768 token。也可手填 1—32768 token 的预算，与等级预设二选一。');
        }
        if (/^gemini-2\.5-(pro|flash|flash-lite)(?:-preview-\d{2}-\d{2})?$/.test(model)) {
            return profile('openai', !model.includes('-pro'), ['low', 'medium', 'high'], '仅用于 Google OpenAI 兼容接口；等级映射思考预算，2.5 Pro 不能关闭。', 'medium');
        }
        if (/^gemini-3(?:\.1)?-pro(?:-preview)?$/.test(model)) {
            return profile('openai', false, model.startsWith('gemini-3.1') ? ['low', 'medium', 'high'] : ['low', 'high'], '仅用于 Google OpenAI 兼容接口；Pro 始终思考，等级按具体版本限制。', 'high');
        }
        if (/^gemini-3(?:\.[157])?-flash(?:-lite)?(?:-preview)?$/.test(model)) {
            return profile('openai', false, ['low', 'medium', 'high'], '仅用于 Google OpenAI 兼容接口；低等级仍是思考，不能用 none 关闭。', 'medium');
        }
        if (/^grok-4\.[56]$/.test(model)) {
            return profile('openai', false, model === 'grok-4.6' ? ['low', 'medium', 'high', 'xhigh'] : ['low', 'medium', 'high'], '默认开启思考；这些推理型号不能关闭。', 'high');
        }
        if (/^grok-4(?:-0709|-fast-reasoning|-1-fast-reasoning)?$/.test(model)) {
            return profile('fixed', false, [], '固定推理型号，保留默认思考；未核验可调 effort，不发送该字段。');
        }
        if (/^MiniMax-M3\.1-Flash-Preview$/.test(model)) {
            return profile('minimax-adaptive', false, ['low', 'medium', 'high', 'xhigh', 'max'], '始终思考，可调等级；预览型号可能仅对特定套餐开放。');
        }
        if (model === 'MiniMax-M3') {
            return profile('minimax-adaptive', true, [], '默认自适应思考，可关闭；该型号不提供有效的 effort 调节。');
        }
        if (/^MiniMax-M2(?:\.[1257])?(?:-highspeed)?$/.test(model)) {
            return profile('minimax-fixed', false, [], 'M2 系列始终思考；关闭字段可能被忽略，因此不开放关闭或虚设等级。');
        }
        if (/^doubao-seed-2-1-(pro|turbo)-260628$/.test(model)) {
            return profile('doubao', true, ['low', 'medium', 'high', 'xhigh', 'max'], '仅适用于此精确模型 ID 的方舟兼容接口；默认开启思考，关闭使用 disabled/minimal。');
        }
        if (model === 'step-3.5-flash-2603') {
            return profile('effort', false, ['low', 'high'], 'Agent 优化版支持低、高推理等级；低推理不等于关闭。');
        }
        if (model === 'step-3.5-flash' || /^hunyuan-(2\.0-thinking|t1(?:-latest)?)$/.test(model)) {
            return profile('fixed', false, [], '已知推理型号，保留默认思考；当前未核验该兼容接口的开关或等级字段。');
        }
        if (/^(hunyuan|ernie|ep-)/i.test(model)) {
            return unknown('已考虑此系列：云端接口或部署别名的实际型号能力尚未核验，不混用原生 API 字段，不提供关闭。');
        }
    } else if (provider === 'ollama') {
        if (/^gpt-oss(?::|$)/.test(model)) {
            return profile('ollama-effort', false, ['low', 'medium', 'high'], '默认开启中等级思考；GPT-OSS 使用 think 等级，不支持布尔关闭。', 'medium');
        }
        if (/^(qwen3(?:\.[568])?|deepseek-r1)(?::|$)/.test(model)) {
            return profile('ollama-switch', true, [], '默认请求开启本地思考；开关是否生效取决于模型包和 Ollama 版本，不虚设等级。');
        }
    }
    return unknown('未知或未适配型号：保留接口原行为，不猜测思考字段；无法保证其开启思考，也不提供未经核验的关闭选项。');
}

export function getThinkingCapabilities(provider: string, model: string) {
    const { modes, efforts, note, style } = getProfile(provider, model);
    return {
        modes, efforts,
        ...(style === 'qwen' ? { budgetTokens: { min: 1, max: 32768 } } : {}),
        note: `默认策略：已核验模型开启思考，等级自动采用推荐值。${note}（依据本地核验规则，非厂商实时探测。）`,
    };
}

export function resolveThinkingOptions(provider: string, model: string, input?: ThinkingConfig): Record<string, unknown> {
    const { mode, effort, budgetTokens } = ThinkingConfigSchema.parse(input ?? {});
    const { style, modes, efforts, defaultEffort } = getProfile(provider, model);
    if (!modes.includes(mode)) throw new Error(`当前型号 ${model} 不支持此思考开关，请使用默认策略或支持的选项。`);
    if (!efforts.includes(effort)) throw new Error(`当前型号 ${model} 不支持“${effort}”思考等级，请选择可用等级。`);
    if (mode === 'disabled' && effort !== 'auto') throw new Error('关闭思考时不能同时指定思考等级。');
    if (budgetTokens !== undefined) {
        if (style !== 'qwen') throw new Error(`当前型号 ${model} 不支持手动思考 token 预算。`);
        if (mode === 'disabled') throw new Error('关闭思考时不能指定思考预算。');
        if (effort !== 'auto') throw new Error('手动思考预算与等级预设不能同时设置。');
    }
    const enabled = mode !== 'disabled';
    const effortOption = effort === 'auto' ? {} : { reasoning_effort: effort };
    switch (style) {
        case 'openai': return { reasoning_effort: enabled ? (effort === 'auto' ? defaultEffort ?? 'medium' : effort) : 'none' };
        case 'switch': return { thinking: { type: enabled ? 'enabled' : 'disabled' } };
        case 'deepseek':
        case 'glm': return { thinking: { type: enabled ? 'enabled' : 'disabled' }, ...effortOption };
        case 'effort': return effortOption;
        case 'qwen': return {
            enable_thinking: enabled,
            ...(budgetTokens !== undefined ? { thinking_budget: budgetTokens }
                : effort !== 'auto' ? { thinking_budget: { low: 2048, medium: 8192, high: 32768 }[effort as 'low' | 'medium' | 'high'] } : {}),
        };
        case 'claude-adaptive': return { thinking: { type: enabled ? 'adaptive' : 'disabled' }, ...(effort !== 'auto' ? { output_config: { effort } } : {}) };
        case 'claude-effort': return effort === 'auto' ? {} : { output_config: { effort } };
        case 'ollama-switch': return { think: enabled };
        case 'ollama-effort': return { think: effort === 'auto' ? defaultEffort ?? 'medium' : effort };
        case 'minimax-adaptive': return { thinking: { type: enabled ? 'adaptive' : 'disabled' }, reasoning_split: true, ...effortOption };
        case 'minimax-fixed': return { reasoning_split: true };
        case 'doubao': return { thinking: { type: enabled ? 'enabled' : 'disabled' }, ...(enabled ? effortOption : { reasoning_effort: 'minimal' }) };
        default: return {};
    }
}
