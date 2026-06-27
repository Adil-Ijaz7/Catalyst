import * as vscode from 'vscode';
import { AgentOrchestrator } from './agent/agentOrchestrator';
import { ContextManager } from './agent/contextManager';
import { ConversationMemory } from './agent/conversationMemory';
import { Planner } from './agent/planner';
import { ToolRegistry } from './agent/toolRegistry';
import { OpenRouterService } from './services/openRouterService';
import { PermissionService } from './services/permissionService';
import { createDefaultTools } from './tools';
import { ChatViewProvider } from './ui/chatViewProvider';
import { DiffPreviewPanel } from './ui/diffPreviewPanel';
import { PendingChangeDiffProvider } from './ui/pendingChangeDiffProvider';
import { AioraExtensionApi } from './types';

export async function activate(context: vscode.ExtensionContext): Promise<AioraExtensionApi | undefined> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    void vscode.window.showWarningMessage('Aiora Code Agent requires an open workspace folder.');
    return;
  }

  const outputChannel = vscode.window.createOutputChannel('Aiora Code Agent');
  const permissionService = new PermissionService(context);
  const toolRegistry = new ToolRegistry();
  for (const tool of createDefaultTools()) {
    toolRegistry.register(tool);
  }

  const openRouterService = new OpenRouterService(context);
  const planner = new Planner();
  const contextManager = new ContextManager();
  const memory = new ConversationMemory();
  const agent = new AgentOrchestrator(
    workspaceFolder.uri,
    planner,
    contextManager,
    memory,
    toolRegistry,
    openRouterService,
    permissionService,
    outputChannel
  );

  const diffPreviewPanel = new DiffPreviewPanel(context.extensionUri);
  const pendingChangeDiffProvider = new PendingChangeDiffProvider();
  const chatViewProvider = new ChatViewProvider(
    context.extensionUri,
    agent,
    openRouterService,
    permissionService,
    diffPreviewPanel,
    pendingChangeDiffProvider
  );

  context.subscriptions.push(
    outputChannel,
    pendingChangeDiffProvider,
    vscode.workspace.registerTextDocumentContentProvider(PendingChangeDiffProvider.scheme, pendingChangeDiffProvider),
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider),
    vscode.commands.registerCommand('aioraCodeAgent.openChat', async () => {
      await chatViewProvider.reveal();
    }),
    vscode.commands.registerCommand('aioraCodeAgent.configureApiKey', async () => {
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
    }),
    vscode.commands.registerCommand('aioraCodeAgent.openDiffPreview', () => {
      diffPreviewPanel.show(agent.getPendingChanges());
    }),
    vscode.commands.registerCommand('aioraCodeAgent.approvePendingChanges', async () => {
      await agent.applyPendingChanges();
      void vscode.window.showInformationMessage('Pending changes applied.');
    }),
    vscode.commands.registerCommand('aioraCodeAgent.rejectPendingChanges', () => {
      agent.clearPendingChanges();
      void vscode.window.showInformationMessage('Pending changes discarded.');
    }),
    vscode.commands.registerCommand('aioraCodeAgent.resetConversation', () => {
      agent.resetConversation();
      void vscode.window.showInformationMessage('Conversation reset.');
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('aioraCodeAgent')) {
        await chatViewProvider.refreshModel();
      }
    })
  );

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

export function deactivate(): void {
  // No-op.
}
