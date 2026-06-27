import * as vscode from 'vscode';
import { AgentOrchestrator } from '../agent/agentOrchestrator';
import { PermissionService } from '../services/permissionService';
import { OpenRouterService } from '../services/openRouterService';
import { ChatMessage, PermissionId, PermissionMode, WebviewState } from '../types';
import { DiffPreviewPanel } from './diffPreviewPanel';
import { PendingChangeDiffProvider } from './pendingChangeDiffProvider';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aioraCodeAgent.chatView';

  private view?: vscode.WebviewView;
  private readonly messages: ChatMessage[] = [];
  private state: WebviewState = {
    model: 'openrouter/free',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyConfigured: false,
    providerOptions: [],
    modelOptions: [],
    connectionStatus: 'idle',
    plan: [],
    messages: [],
    toolActivity: [],
    pendingChanges: [],
    permissions: [],
    busy: false
  };

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly agent: AgentOrchestrator,
    private readonly openRouterService: OpenRouterService,
    private readonly permissionService: PermissionService,
    private readonly diffPreviewPanel: DiffPreviewPanel,
    private readonly pendingChangeDiffProvider: PendingChangeDiffProvider
  ) {}

  public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
    this.view = webviewView;
    const webview = webviewView.webview;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
    };

    const settings = await this.openRouterService.getSettings();
    this.state.model = settings.model;
    this.state.provider = settings.provider;
    this.state.baseUrl = settings.baseUrl;
    this.state.apiKeyConfigured = Boolean(settings.apiKey);
    this.state.providerOptions = this.openRouterService.getProviderOptions();
    this.state.modelOptions = this.openRouterService.getModelOptions(settings.provider);
    this.state.permissions = this.permissionService.getRules();
    webview.html = this.getHtml(webview);

    webview.onDidReceiveMessage(async (message: { type: string; payload?: unknown }) => {
      switch (message.type) {
        case 'ready':
          this.postState();
          break;
        case 'submitPrompt':
          await this.handlePrompt(String(message.payload ?? ''));
          break;
        case 'approveChanges':
          await this.applyPendingChanges(message.payload);
          break;
        case 'rejectChanges':
          this.discardPendingChanges(message.payload);
          break;
        case 'openChangeDiff':
          await this.openChangeDiff(String(message.payload ?? ''));
          break;
        case 'applySingleChange':
          await this.applyPendingChanges([String(message.payload ?? '')]);
          break;
        case 'discardSingleChange':
          this.discardPendingChanges([String(message.payload ?? '')]);
          break;
        case 'openDiffPreview':
          this.diffPreviewPanel.show(this.agent.getPendingChanges());
          break;
        case 'openSettings':
          await vscode.commands.executeCommand('workbench.action.openSettings', 'aioraCodeAgent');
          break;
        case 'setApiKey':
          await this.setApiKey();
          break;
        case 'setProvider':
          await this.setProvider(String(message.payload ?? ''));
          break;
        case 'setModel':
          await this.setModel(String(message.payload ?? ''));
          break;
        case 'saveBaseUrl':
          await this.saveBaseUrl(String(message.payload ?? ''));
          break;
        case 'testConnection':
          await this.testConnection();
          break;
        case 'setPermissionMode':
          await this.setPermissionMode(message.payload);
          break;
        case 'resetConversation':
          this.agent.resetConversation();
          this.messages.length = 0;
          this.state = { ...this.state, plan: [], messages: [], toolActivity: [], pendingChanges: [], streamingText: undefined, lastResponse: undefined, error: undefined };
          this.postState();
          break;
        default:
          break;
      }
    });
  }

  public async reveal(): Promise<void> {
    await vscode.commands.executeCommand('workbench.view.extension.aioraCodeAgentSidebar');
  }

  public async refreshModel(): Promise<void> {
    const settings = await this.openRouterService.getSettings();
    this.state.model = settings.model;
    this.state.provider = settings.provider;
    this.state.baseUrl = settings.baseUrl;
    this.state.apiKeyConfigured = Boolean(settings.apiKey);
    this.state.providerOptions = this.openRouterService.getProviderOptions();
    this.state.modelOptions = this.openRouterService.getModelOptions(settings.provider);
    this.state.permissions = this.permissionService.getRules();
    this.postState();
  }

  private async handlePrompt(prompt: string): Promise<void> {
    if (!prompt.trim()) {
      return;
    }

    this.messages.push({ role: 'user', content: prompt });
    this.state = {
      ...this.state,
      busy: true,
      error: undefined,
      streamingText: '',
      messages: [...this.messages]
    };
    this.postState();

    try {
      const result = await this.agent.run(prompt, {
        onProgress: (progress) => {
          this.state = {
            ...this.state,
            plan: progress.plan ?? this.state.plan,
            toolActivity: progress.toolActivity ?? this.state.toolActivity,
            pendingChanges: progress.pendingChanges ?? this.state.pendingChanges,
            streamingText: progress.streamingText ?? this.state.streamingText
          };
          this.postState();
        }
      });
      this.messages.push({ role: 'assistant', content: result.response });
      this.state = {
        ...this.state,
        busy: false,
        plan: result.plan,
        messages: [...this.messages],
        toolActivity: result.toolActivity,
        pendingChanges: result.pendingChanges,
        streamingText: undefined,
        lastResponse: result.response
      };
      this.postState();
    } catch (error) {
      this.state = {
        ...this.state,
        busy: false,
        streamingText: undefined,
        error: error instanceof Error ? error.message : String(error)
      };
      this.postState();
    }
  }

  private async applyPendingChanges(payload?: unknown): Promise<void> {
    const selectedIds = Array.isArray(payload)
      ? payload.map((value) => String(value))
      : this.agent.getPendingChanges().map((change) => change.id);

    if (!selectedIds.length) {
      return;
    }

    const confirmation = await vscode.window.showWarningMessage(
      `Apply ${selectedIds.length} pending change(s)?`,
      { modal: true },
      'Apply Changes'
    );

    if (confirmation !== 'Apply Changes') {
      return;
    }

    await this.agent.applyPendingChangeSubset(selectedIds);
    this.state.pendingChanges = this.agent.getPendingChanges();
    this.postState();
    void vscode.window.showInformationMessage('Aiora Code Agent applied the approved changes.');
  }

  private discardPendingChanges(payload?: unknown): void {
    const selectedIds = Array.isArray(payload)
      ? payload.map((value) => String(value))
      : this.agent.getPendingChanges().map((change) => change.id);

    this.agent.discardPendingChangeSubset(selectedIds);
    this.state.pendingChanges = this.agent.getPendingChanges();
    this.postState();
  }

  private async openChangeDiff(changeId: string): Promise<void> {
    const change = this.agent.getPendingChangeById(changeId);
    if (!change) {
      return;
    }

    await this.pendingChangeDiffProvider.showChange(change);
  }

  private async setApiKey(): Promise<void> {
    const apiKey = await vscode.window.showInputBox({
      title: 'OpenRouter API Key',
      prompt: 'Enter your OpenRouter API key',
      password: true,
      ignoreFocusOut: true
    });

    if (!apiKey) {
      return;
    }

    await this.openRouterService.storeApiKey(apiKey);
    this.state.apiKeyConfigured = true;
    this.state.connectionStatus = 'idle';
    this.state.connectionMessage = 'API key saved.';
    this.postState();
    void vscode.window.showInformationMessage('OpenRouter API key saved securely.');
  }

  private async setProvider(provider: string): Promise<void> {
    if (!provider) {
      return;
    }

    await this.openRouterService.updateProvider(provider);
    const models = this.openRouterService.getModelOptions(provider);
    await this.openRouterService.updateModel(models[0] ?? 'openrouter/free');
    await this.refreshModel();
  }

  private async setModel(model: string): Promise<void> {
    if (!model) {
      return;
    }

    await this.openRouterService.updateModel(model);
    await this.refreshModel();
  }

  private async saveBaseUrl(baseUrl: string): Promise<void> {
    if (!baseUrl.trim()) {
      return;
    }

    await this.openRouterService.updateBaseUrl(baseUrl.trim());
    await this.refreshModel();
  }

  private async testConnection(): Promise<void> {
    this.state.connectionStatus = 'testing';
    this.state.connectionMessage = 'Testing connection...';
    this.postState();

    try {
      const result = await this.openRouterService.testConnection();
      this.state.connectionStatus = result.ok ? 'success' : 'error';
      this.state.connectionMessage = result.message;
      this.postState();
    } catch (error) {
      this.state.connectionStatus = 'error';
      this.state.connectionMessage = error instanceof Error ? error.message : String(error);
      this.postState();
    }
  }

  private async setPermissionMode(payload: unknown): Promise<void> {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const permissionId = String((payload as { permissionId?: unknown }).permissionId ?? '') as PermissionId;
    const mode = String((payload as { mode?: unknown }).mode ?? '') as PermissionMode;
    await this.permissionService.setMode(permissionId, mode);
    this.state.permissions = this.permissionService.getRules();
    this.postState();
  }

  private postState(): void {
    this.view?.webview.postMessage({
      type: 'state',
      payload: this.state
    });
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css'));
    const nonce = String(Date.now());

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';" />
        <link rel="stylesheet" href="${styleUri}" />
        <title>Aiora Code Agent</title>
      </head>
      <body>
        <div id="app"></div>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}
