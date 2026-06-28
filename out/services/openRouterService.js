"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenRouterService = void 0;
const vscode = __importStar(require("vscode"));
const SECRET_KEY_NAME = 'aiora.openRouterApiKey';
const PROVIDER_OPTIONS = [
    { id: 'openrouter', label: 'OpenRouter', note: 'Fully validated in this extension.' },
    { id: 'openai', label: 'OpenAI Compatible', note: 'Use an OpenAI-compatible base URL.' },
    { id: 'anthropic', label: 'Anthropic Compatible', note: 'Requires a compatible adapter endpoint.' },
    { id: 'google', label: 'Google Compatible', note: 'Requires a compatible adapter endpoint.' },
    { id: 'ollama', label: 'Ollama', note: 'Use a local OpenAI-compatible endpoint.' },
    { id: 'groq', label: 'Groq', note: 'Use an OpenAI-compatible Groq endpoint.' },
    { id: 'deepseek', label: 'DeepSeek', note: 'Use an OpenAI-compatible DeepSeek endpoint.' },
    { id: 'qwen', label: 'Qwen', note: 'Use a compatible gateway endpoint.' },
    { id: 'mistral', label: 'Mistral', note: 'Use an OpenAI-compatible Mistral endpoint.' },
    { id: 'xai', label: 'xAI', note: 'Use an OpenAI-compatible xAI endpoint.' },
    { id: 'agentrouter', label: 'AgentRouter', note: 'Use a compatible chat-completions endpoint.' }
];
const PROVIDER_MODELS = {
    openrouter: [
        'openrouter/free',
        'openrouter/owl-alpha',
        'nex-agi/nex-n2-pro:free',
        'poolside/laguna-m.1:free',
        'openai/gpt-oss-120b:free',
        'anthropic/claude-3.5-sonnet',
        'openai/gpt-5',
        'google/gemini-2.5-pro',
        'deepseek/deepseek-chat'
    ],
    openai: ['gpt-5', 'gpt-4.1', 'gpt-4o'],
    anthropic: ['claude-sonnet-4', 'claude-3-5-sonnet-latest'],
    google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    ollama: ['llama3.1', 'qwen2.5-coder', 'deepseek-r1'],
    groq: ['llama-3.3-70b-versatile', 'qwen-qwq-32b'],
    deepseek: ['deepseek-chat', 'deepseek-reasoner'],
    qwen: ['qwen2.5-coder-32b-instruct', 'qwq-32b'],
    mistral: ['mistral-large-latest', 'codestral-latest'],
    xai: ['grok-3-mini', 'grok-3'],
    agentrouter: ['agentrouter/default']
};
class OpenRouterService {
    context;
    constructor(context) {
        this.context = context;
    }
    async getSettings() {
        const config = vscode.workspace.getConfiguration('aioraCodeAgent');
        const apiKey = config.get('openRouterApiKey') || (await this.context.secrets.get(SECRET_KEY_NAME)) || '';
        return {
            provider: config.get('provider', 'openrouter'),
            apiKey,
            model: config.get('model', 'openrouter/free'),
            baseUrl: config.get('baseUrl', 'https://openrouter.ai/api/v1'),
            maxIterations: config.get('maxIterations', 6),
            maxContextFiles: config.get('maxContextFiles', 6),
            allowTerminalCommands: config.get('allowTerminalCommands', true)
        };
    }
    async storeApiKey(apiKey) {
        await this.context.secrets.store(SECRET_KEY_NAME, apiKey.trim());
    }
    async updateProvider(provider) {
        const config = vscode.workspace.getConfiguration('aioraCodeAgent');
        await config.update('provider', provider, vscode.ConfigurationTarget.Workspace);
    }
    async updateModel(model) {
        const config = vscode.workspace.getConfiguration('aioraCodeAgent');
        await config.update('model', model, vscode.ConfigurationTarget.Workspace);
    }
    async updateBaseUrl(baseUrl) {
        const config = vscode.workspace.getConfiguration('aioraCodeAgent');
        await config.update('baseUrl', baseUrl, vscode.ConfigurationTarget.Workspace);
    }
    getProviderOptions() {
        return [...PROVIDER_OPTIONS];
    }
    getModelOptions(provider) {
        return [...(PROVIDER_MODELS[provider] ?? PROVIDER_MODELS.openrouter)];
    }
    async testConnection() {
        const settings = await this.getSettings();
        if (!settings.apiKey) {
            return { ok: false, message: 'Missing API key.' };
        }
        const response = await fetch(`${settings.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${settings.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/aiora/code-agent',
                'X-Title': 'Aiora Code Agent'
            },
            body: JSON.stringify({
                model: settings.model,
                messages: [{ role: 'user', content: 'Reply with exactly OK' }]
            })
        });
        if (!response.ok) {
            const text = await response.text();
            return { ok: false, message: `Request failed (${response.status}): ${text}` };
        }
        const json = (await response.json());
        const content = json.choices?.[0]?.message?.content ?? '';
        return {
            ok: true,
            message: content ? `Connected successfully. Sample reply: ${content}` : 'Connected successfully.'
        };
    }
    async chat(messages, tools, onTextDelta) {
        if (onTextDelta) {
            return this.chatStream(messages, tools, onTextDelta);
        }
        const settings = await this.getSettings();
        if (!settings.apiKey) {
            throw new Error('Missing OpenRouter API key. Run "Aiora Code Agent: Configure OpenRouter API Key".');
        }
        const body = {
            model: settings.model,
            messages: messages.map((message) => {
                if (message.role === 'assistant' && message.toolCalls) {
                    return {
                        role: message.role,
                        content: message.content,
                        tool_calls: message.toolCalls.map((toolCall) => ({
                            id: toolCall.id,
                            type: 'function',
                            function: {
                                name: toolCall.name,
                                arguments: JSON.stringify(toolCall.arguments)
                            }
                        }))
                    };
                }
                if (message.role === 'tool') {
                    return {
                        role: 'tool',
                        content: message.content,
                        tool_call_id: message.toolCallId,
                        name: message.name
                    };
                }
                if (message.role === 'user' && message.images?.length) {
                    const contentParts = [{ type: 'text', text: message.content }];
                    for (const img of message.images) {
                        contentParts.push({
                            type: 'image_url',
                            image_url: { url: img }
                        });
                    }
                    return {
                        role: 'user',
                        content: contentParts
                    };
                }
                return {
                    role: message.role,
                    content: message.content
                };
            }),
            tools,
            tool_choice: tools.length ? 'auto' : undefined
        };
        const response = await fetch(`${settings.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${settings.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/aiora/code-agent',
                'X-Title': 'Aiora Code Agent'
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`OpenRouter request failed (${response.status}): ${text}`);
        }
        const json = (await response.json());
        const message = json.choices?.[0]?.message;
        if (!message) {
            throw new Error('OpenRouter response did not include a message.');
        }
        return message;
    }
    async chatStream(messages, tools, onTextDelta) {
        const settings = await this.getSettings();
        if (!settings.apiKey) {
            throw new Error('Missing OpenRouter API key. Run "Aiora Code Agent: Configure OpenRouter API Key".');
        }
        const body = {
            model: settings.model,
            messages: messages.map((message) => {
                if (message.role === 'assistant' && message.toolCalls) {
                    return {
                        role: message.role,
                        content: message.content,
                        tool_calls: message.toolCalls.map((toolCall) => ({
                            id: toolCall.id,
                            type: 'function',
                            function: {
                                name: toolCall.name,
                                arguments: JSON.stringify(toolCall.arguments)
                            }
                        }))
                    };
                }
                if (message.role === 'tool') {
                    return {
                        role: 'tool',
                        content: message.content,
                        tool_call_id: message.toolCallId,
                        name: message.name
                    };
                }
                if (message.role === 'user' && message.images?.length) {
                    const contentParts = [{ type: 'text', text: message.content }];
                    for (const img of message.images) {
                        contentParts.push({
                            type: 'image_url',
                            image_url: { url: img }
                        });
                    }
                    return {
                        role: 'user',
                        content: contentParts
                    };
                }
                return {
                    role: message.role,
                    content: message.content
                };
            }),
            tools,
            tool_choice: tools.length ? 'auto' : undefined,
            stream: true
        };
        const response = await fetch(`${settings.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${settings.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/aiora/code-agent',
                'X-Title': 'Aiora Code Agent'
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`OpenRouter request failed (${response.status}): ${text}`);
        }
        if (!response.body) {
            throw new Error('OpenRouter streaming response did not include a body.');
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let content = '';
        const toolCalls = new Map();
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? '';
            for (const frame of frames) {
                const dataLines = frame
                    .split('\n')
                    .map((line) => line.trim())
                    .filter((line) => line.startsWith('data:'))
                    .map((line) => line.slice(5).trim());
                for (const line of dataLines) {
                    if (!line || line === '[DONE]') {
                        continue;
                    }
                    const payload = JSON.parse(line);
                    const delta = payload.choices?.[0]?.delta;
                    if (!delta) {
                        continue;
                    }
                    if (delta.content) {
                        content += delta.content;
                        onTextDelta(delta.content, content);
                    }
                    for (const toolCallDelta of delta.tool_calls ?? []) {
                        const current = toolCalls.get(toolCallDelta.index) ?? {
                            id: '',
                            name: '',
                            arguments: ''
                        };
                        if (toolCallDelta.id) {
                            current.id = toolCallDelta.id;
                        }
                        if (toolCallDelta.function?.name) {
                            current.name = toolCallDelta.function.name;
                        }
                        if (toolCallDelta.function?.arguments) {
                            current.arguments += toolCallDelta.function.arguments;
                        }
                        toolCalls.set(toolCallDelta.index, current);
                    }
                }
            }
        }
        const message = {
            role: 'assistant',
            content
        };
        if (toolCalls.size) {
            message.tool_calls = Array.from(toolCalls.entries())
                .sort(([left], [right]) => left - right)
                .map(([, toolCall]) => ({
                id: toolCall.id,
                type: 'function',
                function: {
                    name: toolCall.name,
                    arguments: toolCall.arguments || '{}'
                }
            }));
        }
        return message;
    }
}
exports.OpenRouterService = OpenRouterService;
//# sourceMappingURL=openRouterService.js.map