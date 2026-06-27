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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const agentOrchestrator_1 = require("./agent/agentOrchestrator");
const contextManager_1 = require("./agent/contextManager");
const conversationMemory_1 = require("./agent/conversationMemory");
const planner_1 = require("./agent/planner");
const toolRegistry_1 = require("./agent/toolRegistry");
const openRouterService_1 = require("./services/openRouterService");
const permissionService_1 = require("./services/permissionService");
const tools_1 = require("./tools");
const chatViewProvider_1 = require("./ui/chatViewProvider");
const diffPreviewPanel_1 = require("./ui/diffPreviewPanel");
const pendingChangeDiffProvider_1 = require("./ui/pendingChangeDiffProvider");
async function activate(context) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        void vscode.window.showWarningMessage('Aiora Code Agent requires an open workspace folder.');
        return;
    }
    const outputChannel = vscode.window.createOutputChannel('Aiora Code Agent');
    const permissionService = new permissionService_1.PermissionService(context);
    const toolRegistry = new toolRegistry_1.ToolRegistry();
    for (const tool of (0, tools_1.createDefaultTools)()) {
        toolRegistry.register(tool);
    }
    const openRouterService = new openRouterService_1.OpenRouterService(context);
    const planner = new planner_1.Planner();
    const contextManager = new contextManager_1.ContextManager();
    const memory = new conversationMemory_1.ConversationMemory();
    const agent = new agentOrchestrator_1.AgentOrchestrator(workspaceFolder.uri, planner, contextManager, memory, toolRegistry, openRouterService, permissionService, outputChannel);
    const diffPreviewPanel = new diffPreviewPanel_1.DiffPreviewPanel(context.extensionUri);
    const pendingChangeDiffProvider = new pendingChangeDiffProvider_1.PendingChangeDiffProvider();
    const chatViewProvider = new chatViewProvider_1.ChatViewProvider(context.extensionUri, agent, openRouterService, permissionService, diffPreviewPanel, pendingChangeDiffProvider);
    context.subscriptions.push(outputChannel, pendingChangeDiffProvider, vscode.workspace.registerTextDocumentContentProvider(pendingChangeDiffProvider_1.PendingChangeDiffProvider.scheme, pendingChangeDiffProvider), vscode.window.registerWebviewViewProvider(chatViewProvider_1.ChatViewProvider.viewType, chatViewProvider), vscode.commands.registerCommand('aioraCodeAgent.openChat', async () => {
        await chatViewProvider.reveal();
    }), vscode.commands.registerCommand('aioraCodeAgent.configureApiKey', async () => {
        const apiKey = await vscode.window.showInputBox({
            title: 'OpenRouter API Key',
            prompt: 'Enter your OpenRouter API key',
            password: true,
            ignoreFocusOut: true
        });
        if (apiKey) {
            await openRouterService.storeApiKey(apiKey);
            void vscode.window.showInformationMessage('OpenRouter API key saved securely.');
        }
    }), vscode.commands.registerCommand('aioraCodeAgent.openDiffPreview', () => {
        diffPreviewPanel.show(agent.getPendingChanges());
    }), vscode.commands.registerCommand('aioraCodeAgent.approvePendingChanges', async () => {
        await agent.applyPendingChanges();
        void vscode.window.showInformationMessage('Pending changes applied.');
    }), vscode.commands.registerCommand('aioraCodeAgent.rejectPendingChanges', () => {
        agent.clearPendingChanges();
        void vscode.window.showInformationMessage('Pending changes discarded.');
    }), vscode.commands.registerCommand('aioraCodeAgent.resetConversation', () => {
        agent.resetConversation();
        void vscode.window.showInformationMessage('Conversation reset.');
    }), vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration('aioraCodeAgent')) {
            await chatViewProvider.refreshModel();
        }
    }));
    return {
        runPrompt: (prompt, options) => agent.run(prompt, options),
        getPendingChanges: () => agent.getPendingChanges(),
        applyPendingChanges: async (changeIds) => {
            if (changeIds?.length) {
                await agent.applyPendingChangeSubset(changeIds);
                return;
            }
            await agent.applyPendingChanges();
        },
        discardPendingChanges: (changeIds) => {
            if (changeIds?.length) {
                agent.discardPendingChangeSubset(changeIds);
                return;
            }
            agent.clearPendingChanges();
        },
        openPendingChangeDiff: async (changeId) => {
            const change = agent.getPendingChangeById(changeId);
            if (change) {
                await pendingChangeDiffProvider.showChange(change);
            }
        },
        resetConversation: () => {
            agent.resetConversation();
        },
        storeApiKey: async (apiKey) => {
            await openRouterService.storeApiKey(apiKey);
        },
        getPermissions: () => permissionService.getRules(),
        setPermissionMode: async (permissionId, mode) => {
            await permissionService.setMode(permissionId, mode);
        }
    };
}
function deactivate() {
    // No-op.
}
//# sourceMappingURL=extension.js.map