import * as vscode from 'vscode';
import {
  ChatMessage,
  OpenRouterResponseMessage,
  OpenRouterSettings,
  OpenRouterToolDefinition,
  ProviderOption
} from '../types';

const SECRET_KEY_NAME = 'aiora.openRouterApiKey';
const PROVIDER_OPTIONS: ProviderOption[] = [
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

const PROVIDER_MODELS: Record<string, string[]> = {
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

interface OpenRouterRequestBody {
  model: string;
  messages: Array<Record<string, unknown>>;
  tools?: OpenRouterToolDefinition[];
  tool_choice?: 'auto';
  stream?: boolean;
}

interface OpenRouterResponseBody {
  choices?: Array<{
    message?: OpenRouterResponseMessage;
  }>;
}

export class OpenRouterService {
  public constructor(private readonly context: vscode.ExtensionContext) {}

  public async getSettings(): Promise<OpenRouterSettings> {
    const config = vscode.workspace.getConfiguration('aioraCodeAgent');
    const apiKey = config.get<string>('openRouterApiKey') || (await this.context.secrets.get(SECRET_KEY_NAME)) || '';
    return {
      provider: config.get<'openrouter'>('provider', 'openrouter'),
      apiKey,
      model: config.get<string>('model', 'openrouter/free'),
      baseUrl: config.get<string>('baseUrl', 'https://openrouter.ai/api/v1'),
      maxIterations: config.get<number>('maxIterations', 6),
      maxContextFiles: config.get<number>('maxContextFiles', 6),
      allowTerminalCommands: config.get<boolean>('allowTerminalCommands', true)
    };
  }

  public async storeApiKey(apiKey: string): Promise<void> {
    await this.context.secrets.store(SECRET_KEY_NAME, apiKey.trim());
  }

  public async updateProvider(provider: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('aioraCodeAgent');
    await config.update('provider', provider, vscode.ConfigurationTarget.Workspace);
  }

  public async updateModel(model: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('aioraCodeAgent');
    await config.update('model', model, vscode.ConfigurationTarget.Workspace);
  }

  public async updateBaseUrl(baseUrl: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('aioraCodeAgent');
    await config.update('baseUrl', baseUrl, vscode.ConfigurationTarget.Workspace);
  }

  public getProviderOptions(): ProviderOption[] {
    return [...PROVIDER_OPTIONS];
  }

  public getModelOptions(provider: string): string[] {
    return [...(PROVIDER_MODELS[provider] ?? PROVIDER_MODELS.openrouter)];
  }

  public async testConnection(): Promise<{ ok: boolean; message: string }> {
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

    const json = (await response.json()) as OpenRouterResponseBody;
    const content = json.choices?.[0]?.message?.content ?? '';
    return {
      ok: true,
      message: content ? `Connected successfully. Sample reply: ${content}` : 'Connected successfully.'
    };
  }

  public async chat(
    messages: ChatMessage[],
    tools: OpenRouterToolDefinition[],
    onTextDelta?: (delta: string, aggregate: string) => void
  ): Promise<OpenRouterResponseMessage> {
    if (onTextDelta) {
      return this.chatStream(messages, tools, onTextDelta);
    }

    const settings = await this.getSettings();
    if (!settings.apiKey) {
      throw new Error('Missing OpenRouter API key. Run "Aiora Code Agent: Configure OpenRouter API Key".');
    }

    const body: OpenRouterRequestBody = {
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

    const json = (await response.json()) as OpenRouterResponseBody;
    const message = json.choices?.[0]?.message;
    if (!message) {
      throw new Error('OpenRouter response did not include a message.');
    }

    return message;
  }

  private async chatStream(
    messages: ChatMessage[],
    tools: OpenRouterToolDefinition[],
    onTextDelta: (delta: string, aggregate: string) => void
  ): Promise<OpenRouterResponseMessage> {
    const settings = await this.getSettings();
    if (!settings.apiKey) {
      throw new Error('Missing OpenRouter API key. Run "Aiora Code Agent: Configure OpenRouter API Key".');
    }

    const body: OpenRouterRequestBody = {
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
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();

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

          const payload = JSON.parse(line) as {
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index: number;
                  id?: string;
                  function?: {
                    name?: string;
                    arguments?: string;
                  };
                }>;
              };
            }>;
          };

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

    const message: OpenRouterResponseMessage = {
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
