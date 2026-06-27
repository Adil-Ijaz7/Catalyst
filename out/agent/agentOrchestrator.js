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
exports.AgentOrchestrator = void 0;
const vscode = __importStar(require("vscode"));
const toolExecutor_1 = require("./toolExecutor");
const pathUtils_1 = require("../utils/pathUtils");
class AgentOrchestrator {
    workspaceRoot;
    planner;
    contextManager;
    memory;
    toolRegistry;
    openRouterService;
    permissionService;
    outputChannel;
    pendingChanges = [];
    constructor(workspaceRoot, planner, contextManager, memory, toolRegistry, openRouterService, permissionService, outputChannel) {
        this.workspaceRoot = workspaceRoot;
        this.planner = planner;
        this.contextManager = contextManager;
        this.memory = memory;
        this.toolRegistry = toolRegistry;
        this.openRouterService = openRouterService;
        this.permissionService = permissionService;
        this.outputChannel = outputChannel;
    }
    getPendingChanges() {
        return [...this.pendingChanges];
    }
    clearPendingChanges() {
        this.pendingChanges = [];
    }
    resetConversation() {
        this.memory.clear();
        this.clearPendingChanges();
    }
    async run(prompt, options) {
        const settings = await this.openRouterService.getSettings();
        let plan = this.planner.createPlan(prompt);
        const context = await this.contextManager.buildSnapshot(this.workspaceRoot, prompt, settings.maxContextFiles);
        plan = this.planner.markStep(plan, 'discover', 'completed');
        plan = this.planner.markStep(plan, 'analyze', 'completed');
        plan = this.planner.markStep(plan, 'execute', 'in_progress');
        options?.onProgress?.({ plan });
        const executor = new toolExecutor_1.ToolExecutor(this.toolRegistry, this.workspaceRoot, this.outputChannel, this.permissionService, (toolActivity) => {
            options?.onProgress?.({ toolActivity });
        });
        const systemPrompt = this.buildSystemPrompt(context.workspaceRoot, settings.allowTerminalCommands);
        const contextPrompt = this.buildContextPrompt(context);
        this.memory.add({ role: 'user', content: prompt });
        const workingMessages = [
            { role: 'system', content: systemPrompt },
            ...this.memory.getAll(),
            { role: 'system', content: contextPrompt }
        ];
        let finalResponse = 'No response generated.';
        for (let iteration = 0; iteration < settings.maxIterations; iteration += 1) {
            const response = await this.openRouterService.chat(workingMessages, this.toolRegistry.toOpenRouterDefinitions(), (_delta, aggregate) => {
                options?.onProgress?.({ streamingText: aggregate });
            });
            const assistantMessage = this.toAssistantMessage(response);
            workingMessages.push(assistantMessage);
            if (assistantMessage.toolCalls?.length) {
                for (const call of assistantMessage.toolCalls) {
                    const result = await executor.execute({
                        id: call.id,
                        name: call.name,
                        args: call.arguments
                    }, true);
                    if (result.workspaceChange) {
                        this.pendingChanges = this.upsertPendingChange(result.workspaceChange);
                        options?.onProgress?.({ pendingChanges: this.getPendingChanges() });
                    }
                    workingMessages.push({
                        role: 'tool',
                        name: call.name,
                        toolCallId: call.id,
                        content: result.content
                    });
                }
                continue;
            }
            finalResponse = assistantMessage.content;
            break;
        }
        plan = this.planner.markStep(plan, 'execute', 'completed');
        plan = this.planner.markStep(plan, 'diff', this.pendingChanges.length ? 'completed' : 'pending');
        plan = this.planner.markStep(plan, 'respond', 'completed');
        options?.onProgress?.({ plan, streamingText: undefined });
        this.memory.add({ role: 'assistant', content: finalResponse });
        return {
            response: finalResponse,
            plan,
            toolActivity: executor.getActivity(),
            pendingChanges: this.getPendingChanges(),
            context
        };
    }
    async applyPendingChanges() {
        await this.applyPendingChangeSubset(this.pendingChanges.map((change) => change.id));
    }
    async applyPendingChangeSubset(changeIds) {
        const selectedIds = new Set(changeIds);
        const selectedChanges = this.pendingChanges.filter((change) => selectedIds.has(change.id));
        for (const change of selectedChanges) {
            const target = (0, pathUtils_1.resolveWorkspacePath)(this.workspaceRoot, change.path);
            if (change.type === 'delete') {
                await vscode.workspace.fs.delete(target, { useTrash: true });
                continue;
            }
            const parent = vscode.Uri.file(require('path').dirname(target.fsPath));
            await vscode.workspace.fs.createDirectory(parent);
            await vscode.workspace.fs.writeFile(target, Buffer.from(change.nextContent ?? '', 'utf8'));
        }
        this.discardPendingChangeSubset(changeIds);
    }
    discardPendingChangeSubset(changeIds) {
        const removedIds = new Set(changeIds);
        this.pendingChanges = this.pendingChanges.filter((change) => !removedIds.has(change.id));
    }
    getPendingChangeById(changeId) {
        return this.pendingChanges.find((change) => change.id === changeId);
    }
    buildSystemPrompt(workspaceRoot, allowTerminalCommands) {
        return [
            'You are Aiora Code Agent, a principal-level AI coding assistant inside VS Code.',
            'Understand the request, plan carefully, inspect workspace context, and use tools when needed.',
            'Never claim file changes were applied until the user approves them. Mutating tools only stage changes.',
            `The workspace root is ${workspaceRoot}.`,
            allowTerminalCommands
                ? 'Validated terminal commands are available when genuinely needed.'
                : 'Do not use terminal commands; that tool is disabled by settings.',
            'Prefer concise, implementation-focused answers. Mention staged diffs when present.'
        ].join(' ');
    }
    buildContextPrompt(context) {
        if (!context.relevantFiles.length) {
            return 'No especially relevant files were discovered yet.';
        }
        const parts = context.relevantFiles.map((file) => {
            return `File: ${file.path}\nScore: ${file.score}\nExcerpt:\n${file.excerpt}`;
        });
        return `Relevant workspace context:\n\n${parts.join('\n\n')}`;
    }
    toAssistantMessage(message) {
        const toolCalls = message.tool_calls?.map((toolCall) => ({
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments || '{}')
        }));
        return {
            role: 'assistant',
            content: message.content ?? '',
            toolCalls
        };
    }
    upsertPendingChange(change) {
        const remaining = this.pendingChanges.filter((entry) => entry.path !== change.path);
        remaining.push(change);
        return remaining;
    }
}
exports.AgentOrchestrator = AgentOrchestrator;
//# sourceMappingURL=agentOrchestrator.js.map