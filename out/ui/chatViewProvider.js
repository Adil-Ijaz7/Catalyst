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
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
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
        busy: false,
        maxIterations: 6,
        maxContextFiles: 6,
        allowTerminalCommands: true
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
        this.state.maxIterations = settings.maxIterations;
        this.state.maxContextFiles = settings.maxContextFiles;
        this.state.allowTerminalCommands = settings.allowTerminalCommands;
        this.state.permissionsNoticeDismissed = this.permissionService.isNoticeDismissed();
        webview.html = this.getHtml(webview);
        webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'ready':
                    this.postState();
                    break;
                case 'submitPrompt':
                    if (message.payload && typeof message.payload === 'object') {
                        const data = message.payload;
                        await this.handlePrompt(data.prompt, data.attachedFiles, data.attachedImages, data.autoContext, data.attachedMentions);
                    }
                    else {
                        await this.handlePrompt(String(message.payload ?? ''));
                    }
                    break;
                case 'queryMentions':
                    if (message.payload && typeof message.payload === 'object') {
                        const data = message.payload;
                        await this.handleQueryMentions(data.query);
                    }
                    break;
                case 'stopPrompt':
                    this.agent.stop();
                    break;
                case 'selectFile':
                    await this.handleSelectFile();
                    break;
                case 'selectImage':
                    await this.handleSelectImage();
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
                case 'openFile':
                    if (message.payload) {
                        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                        if (workspaceFolder) {
                            const uri = vscode.Uri.joinPath(workspaceFolder.uri, String(message.payload));
                            vscode.commands.executeCommand('vscode.open', uri).then(undefined, () => {
                                vscode.window.showErrorMessage(`Could not open ${message.payload}`);
                            });
                        }
                    }
                    break;
                case 'openSettings':
                    await vscode.commands.executeCommand('workbench.action.openSettings', 'aioraCodeAgent');
                    break;
                case 'setApiKey':
                    if (typeof message.payload === 'string') {
                        await this.openRouterService.storeApiKey(message.payload);
                        this.state.apiKeyConfigured = Boolean(message.payload.trim());
                        this.state.connectionStatus = 'idle';
                        this.state.connectionMessage = 'API key saved.';
                        this.postState();
                        void vscode.window.showInformationMessage('API key saved securely.');
                    }
                    else {
                        await this.setApiKey();
                    }
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
                case 'setMaxIterations':
                    if (typeof message.payload === 'number') {
                        const config = vscode.workspace.getConfiguration('aioraCodeAgent');
                        await config.update('maxIterations', message.payload, vscode.ConfigurationTarget.Workspace);
                        await this.refreshModel();
                    }
                    break;
                case 'setMaxContextFiles':
                    if (typeof message.payload === 'number') {
                        const config = vscode.workspace.getConfiguration('aioraCodeAgent');
                        await config.update('maxContextFiles', message.payload, vscode.ConfigurationTarget.Workspace);
                        await this.refreshModel();
                    }
                    break;
                case 'setAllowTerminalCommands':
                    if (typeof message.payload === 'boolean') {
                        const config = vscode.workspace.getConfiguration('aioraCodeAgent');
                        await config.update('allowTerminalCommands', message.payload, vscode.ConfigurationTarget.Workspace);
                        await this.refreshModel();
                    }
                    break;
                case 'testConnection':
                    await this.testConnection();
                    break;
                case 'setPermissionMode':
                    await this.setPermissionMode(message.payload);
                    break;
                case 'dismissPermissionsNotice':
                    await this.permissionService.setNoticeDismissed(true);
                    this.state.permissionsNoticeDismissed = true;
                    this.postState();
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
        this.state.maxIterations = settings.maxIterations;
        this.state.maxContextFiles = settings.maxContextFiles;
        this.state.allowTerminalCommands = settings.allowTerminalCommands;
        this.state.permissionsNoticeDismissed = this.permissionService.isNoticeDismissed();
        this.postState();
    }
    async handlePrompt(prompt, attachedFiles, attachedImages, autoContext, attachedMentions) {
        if (!prompt.trim() && (!attachedFiles || !attachedFiles.length) && (!attachedImages || !attachedImages.length) && (!attachedMentions || !attachedMentions.length)) {
            return;
        }
        // Construct the formatted prompt with file contents if present
        let formattedPrompt = prompt;
        if (attachedFiles && attachedFiles.length > 0) {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            formattedPrompt += '\n\n[Additional Context Files]';
            for (const file of attachedFiles) {
                try {
                    const uri = workspaceFolder
                        ? vscode.Uri.joinPath(workspaceFolder.uri, file.path)
                        : vscode.Uri.file(file.path);
                    const bytes = await vscode.workspace.fs.readFile(uri);
                    const content = Buffer.from(bytes).toString('utf8');
                    formattedPrompt += `\n\n--- File: ${file.path} ---\n${content}\n--- End File ---`;
                }
                catch (err) {
                    formattedPrompt += `\n\n--- File: ${file.path} (Failed to read content) ---`;
                }
            }
        }
        // Resolve rich mentions context
        if (attachedMentions && attachedMentions.length > 0) {
            formattedPrompt += '\n\n[Rich Mentions Context]';
            for (const mention of attachedMentions) {
                if (mention.type === 'file') {
                    try {
                        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                        const uri = workspaceFolder
                            ? vscode.Uri.joinPath(workspaceFolder.uri, mention.value)
                            : vscode.Uri.file(mention.value);
                        const bytes = await vscode.workspace.fs.readFile(uri);
                        const content = Buffer.from(bytes).toString('utf8');
                        formattedPrompt += `\n\n--- File: ${mention.value} ---\n${content}\n--- End File ---`;
                    }
                    catch (err) {
                        formattedPrompt += `\n\n--- File: ${mention.value} (Failed to read) ---`;
                    }
                }
                else if (mention.type === 'git') {
                    try {
                        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        if (workspaceFolder) {
                            const diff = (0, child_process_1.execSync)('git diff', { cwd: workspaceFolder }).toString();
                            const status = (0, child_process_1.execSync)('git status -s', { cwd: workspaceFolder }).toString();
                            formattedPrompt += `\n\n--- Git Status ---\n${status}\n--- Git Diff ---\n${diff}\n--- End Git ---`;
                        }
                    }
                    catch (err) {
                        formattedPrompt += `\n\n--- Git (Failed to retrieve changes) ---`;
                    }
                }
                else if (mention.type === 'problems') {
                    const diagnostics = vscode.languages.getDiagnostics();
                    let problemsText = '';
                    for (const [uri, diagList] of diagnostics) {
                        if (diagList.length > 0) {
                            problemsText += `File: ${vscode.workspace.asRelativePath(uri)}\n`;
                            for (const diag of diagList) {
                                problemsText += `- [${vscode.DiagnosticSeverity[diag.severity]}] Line ${diag.range.start.line + 1}: ${diag.message}\n`;
                            }
                        }
                    }
                    formattedPrompt += `\n\n--- Diagnostics / Workspace Problems ---\n${problemsText || 'No workspace diagnostics.'}\n--- End Problems ---`;
                }
                else if (mention.type === 'terminal') {
                    const activeTerminal = vscode.window.activeTerminal;
                    formattedPrompt += `\n\n--- Active Terminal ---\nName: ${activeTerminal ? activeTerminal.name : 'None'}\n--- End Terminal ---`;
                }
                else if (mention.type === 'workspace') {
                    const files = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git,out,dist}/**', 50);
                    const filePaths = files.map(f => vscode.workspace.asRelativePath(f));
                    formattedPrompt += `\n\n--- Workspace Index ---\nFiles available:\n${filePaths.join('\n')}\n--- End Workspace Index ---`;
                }
            }
        }
        // Read attached images as base64 data URLs
        const base64Images = [];
        if (attachedImages && attachedImages.length > 0) {
            for (const img of attachedImages) {
                try {
                    const uri = vscode.Uri.file(img.path);
                    const bytes = await vscode.workspace.fs.readFile(uri);
                    const ext = img.path.split('.').pop() || 'png';
                    const base64 = `data:image/${ext};base64,${Buffer.from(bytes).toString('base64')}`;
                    base64Images.push(base64);
                }
                catch (err) {
                    console.error('Failed to read image:', err);
                }
            }
        }
        // Add user message to history
        const userMsg = { role: 'user', content: prompt };
        if (base64Images.length > 0) {
            userMsg.images = base64Images;
        }
        this.messages.push(userMsg);
        this.state = {
            ...this.state,
            busy: true,
            error: undefined,
            streamingText: '',
            messages: [...this.messages]
        };
        this.postState();
        try {
            const result = await this.agent.run(formattedPrompt, {
                onProgress: (progress) => {
                    this.state = {
                        ...this.state,
                        plan: progress.plan ?? this.state.plan,
                        toolActivity: progress.toolActivity ?? this.state.toolActivity,
                        pendingChanges: progress.pendingChanges ?? this.state.pendingChanges,
                        streamingText: progress.streamingText ?? this.state.streamingText
                    };
                    this.postState();
                    if (progress.event) {
                        this.view?.webview.postMessage({
                            type: 'agentEvent',
                            payload: progress.event
                        });
                    }
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
    async handleSelectFile() {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            title: 'Select Files to Mention'
        });
        if (!uris || !uris.length) {
            return;
        }
        const files = uris.map((uri) => {
            const relativePath = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
            return {
                path: relativePath,
                name: relativePath.split('/').pop() || relativePath
            };
        });
        this.view?.webview.postMessage({
            type: 'filesSelected',
            payload: files
        });
    }
    async handleSelectImage() {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            filters: {
                'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
            },
            title: 'Select Images'
        });
        if (!uris || !uris.length) {
            return;
        }
        const images = uris.map((uri) => {
            const webviewUri = this.view?.webview.asWebviewUri(uri).toString() || '';
            return {
                path: uri.fsPath,
                webviewUri,
                name: vscode.workspace.asRelativePath(uri, false).split('/').pop() || 'image'
            };
        });
        this.view?.webview.postMessage({
            type: 'imagesSelected',
            payload: images
        });
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
        const settings = await this.openRouterService.getSettings();
        const providerLabel = this.openRouterService.getProviderOptions().find((provider) => provider.id === settings.provider)?.label ?? settings.provider;
        const apiKey = await vscode.window.showInputBox({
            title: `${providerLabel} API Key`,
            prompt: `Enter your ${providerLabel} API key`,
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
        void vscode.window.showInformationMessage(`${providerLabel} API key saved securely.`);
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
    async handleQueryMentions(query) {
        const results = [];
        // System mentions
        const systemMentions = [
            { id: 'workspace', label: '@workspace', detail: 'Codebase context snapshot', type: 'workspace', value: '' },
            { id: 'git', label: '@git', detail: 'Active changes (git diff/status)', type: 'git', value: '' },
            { id: 'problems', label: '@problems', detail: 'Workspace errors & warnings', type: 'problems', value: '' },
            { id: 'terminal', label: '@terminal', detail: 'Active terminal details', type: 'terminal', value: '' }
        ];
        const normalizedQuery = query.toLowerCase().trim();
        const q = normalizedQuery.startsWith('@') ? normalizedQuery.slice(1) : normalizedQuery;
        systemMentions.forEach(mention => {
            if (mention.id.includes(q)) {
                results.push(mention);
            }
        });
        // Workspace files
        try {
            const globPattern = q ? `**/*${q}*` : '**/*';
            const files = await vscode.workspace.findFiles(globPattern, '**/{node_modules,.git,out,dist}/**', 30);
            for (const file of files) {
                const relativePath = vscode.workspace.asRelativePath(file).replace(/\\/g, '/');
                let size = 0;
                let mtime = Date.now();
                try {
                    const stats = fs.statSync(file.fsPath);
                    size = stats.size;
                    mtime = stats.mtimeMs;
                }
                catch (_) { }
                results.push({
                    id: `file:${relativePath}`,
                    label: relativePath.split('/').pop() || relativePath,
                    detail: relativePath,
                    type: 'file',
                    value: relativePath,
                    size,
                    mtime
                });
            }
        }
        catch (err) {
            console.error('Error querying mentions:', err);
        }
        this.view?.webview.postMessage({
            type: 'mentionsResults',
            payload: results
        });
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