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
exports.ChatViewProvider = void 0;
const vscode = __importStar(require("vscode"));
class ChatViewProvider {
    extensionUri;
    agent;
    openRouterService;
    permissionService;
    diffPreviewPanel;
    pendingChangeDiffProvider;
    static viewType = 'aioraCodeAgent.chatView';
    view;
    messages = [];
    state = {
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
    constructor(extensionUri, agent, openRouterService, permissionService, diffPreviewPanel, pendingChangeDiffProvider) {
        this.extensionUri = extensionUri;
        this.agent = agent;
        this.openRouterService = openRouterService;
        this.permissionService = permissionService;
        this.diffPreviewPanel = diffPreviewPanel;
        this.pendingChangeDiffProvider = pendingChangeDiffProvider;
    }
    async resolveWebviewView(webviewView) {
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
        webview.onDidReceiveMessage(async (message) => {
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
    async reveal() {
        await vscode.commands.executeCommand('workbench.view.extension.aioraCodeAgentSidebar');
    }
    async refreshModel() {
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
    async handlePrompt(prompt) {
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
        }
        catch (error) {
            this.state = {
                ...this.state,
                busy: false,
                streamingText: undefined,
                error: error instanceof Error ? error.message : String(error)
            };
            this.postState();
        }
    }
    async applyPendingChanges(payload) {
        const selectedIds = Array.isArray(payload)
            ? payload.map((value) => String(value))
            : this.agent.getPendingChanges().map((change) => change.id);
        if (!selectedIds.length) {
            return;
        }
        const confirmation = await vscode.window.showWarningMessage(`Apply ${selectedIds.length} pending change(s)?`, { modal: true }, 'Apply Changes');
        if (confirmation !== 'Apply Changes') {
            return;
        }
        await this.agent.applyPendingChangeSubset(selectedIds);
        this.state.pendingChanges = this.agent.getPendingChanges();
        this.postState();
        void vscode.window.showInformationMessage('Aiora Code Agent applied the approved changes.');
    }
    discardPendingChanges(payload) {
        const selectedIds = Array.isArray(payload)
            ? payload.map((value) => String(value))
            : this.agent.getPendingChanges().map((change) => change.id);
        this.agent.discardPendingChangeSubset(selectedIds);
        this.state.pendingChanges = this.agent.getPendingChanges();
        this.postState();
    }
    async openChangeDiff(changeId) {
        const change = this.agent.getPendingChangeById(changeId);
        if (!change) {
            return;
        }
        await this.pendingChangeDiffProvider.showChange(change);
    }
    async setApiKey() {
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
    async setProvider(provider) {
        if (!provider) {
            return;
        }
        await this.openRouterService.updateProvider(provider);
        const models = this.openRouterService.getModelOptions(provider);
        await this.openRouterService.updateModel(models[0] ?? 'openrouter/free');
        await this.refreshModel();
    }
    async setModel(model) {
        if (!model) {
            return;
        }
        await this.openRouterService.updateModel(model);
        await this.refreshModel();
    }
    async saveBaseUrl(baseUrl) {
        if (!baseUrl.trim()) {
            return;
        }
        await this.openRouterService.updateBaseUrl(baseUrl.trim());
        await this.refreshModel();
    }
    async testConnection() {
        this.state.connectionStatus = 'testing';
        this.state.connectionMessage = 'Testing connection...';
        this.postState();
        try {
            const result = await this.openRouterService.testConnection();
            this.state.connectionStatus = result.ok ? 'success' : 'error';
            this.state.connectionMessage = result.message;
            this.postState();
        }
        catch (error) {
            this.state.connectionStatus = 'error';
            this.state.connectionMessage = error instanceof Error ? error.message : String(error);
            this.postState();
        }
    }
    async setPermissionMode(payload) {
        if (!payload || typeof payload !== 'object') {
            return;
        }
        const permissionId = String(payload.permissionId ?? '');
        const mode = String(payload.mode ?? '');
        await this.permissionService.setMode(permissionId, mode);
        this.state.permissions = this.permissionService.getRules();
        this.postState();
    }
    postState() {
        this.view?.webview.postMessage({
            type: 'state',
            payload: this.state
        });
    }
    getHtml(webview) {
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
exports.ChatViewProvider = ChatViewProvider;
//# sourceMappingURL=chatViewProvider.js.map