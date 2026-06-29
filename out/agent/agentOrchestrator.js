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
    abortController = null;
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
    stop() {
        this.abortController?.abort();
        this.abortController = null;
    }
    async run(prompt, options) {
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        // Dispatch start event
        options?.onProgress?.({ event: { type: 'agent:start' } });
        try {
            const settings = await this.openRouterService.getSettings();
            let plan = this.planner.createPlan(prompt);
            options?.onProgress?.({ event: { type: 'agent:thinking:start', payload: 'Analyzing workspace context...' } });
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
            let finalResponse = '';
            let hasResponded = false;
            for (let iteration = 0; iteration < settings.maxIterations; iteration += 1) {
                if (signal.aborted) {
                    throw new Error('Agent run stopped by user.');
                }
                options?.onProgress?.({ event: { type: 'agent:thinking:start', payload: `Thinking (iteration ${iteration + 1})...` } });
                const response = await this.openRouterService.chat(workingMessages, this.toolRegistry.toOpenRouterDefinitions(), (_delta, aggregate) => {
                    options?.onProgress?.({
                        streamingText: aggregate,
                        event: { type: 'agent:thinking:update', payload: { delta: _delta, aggregate } }
                    });
                }, signal);
                const assistantMessage = this.toAssistantMessage(response);
                workingMessages.push(assistantMessage);
                if (assistantMessage.content && !assistantMessage.toolCalls?.length) {
                    finalResponse += (hasResponded ? '\n\n' : '') + assistantMessage.content;
                    hasResponded = true;
                }
                if (assistantMessage.toolCalls?.length) {
                    options?.onProgress?.({ streamingText: undefined });
                    for (const call of assistantMessage.toolCalls) {
                        // Emit tool start and specific file operation events
                        options?.onProgress?.({ event: { type: 'agent:tool:start', payload: { name: call.name, args: call.arguments } } });
                        let fileEvent = null;
                        if (call.name === 'read_file') {
                            fileEvent = { type: 'agent:file:read', payload: { path: call.arguments.path } };
                        }
                        else if (call.name === 'write_file' || call.name === 'edit_file') {
                            fileEvent = { type: 'agent:file:edit', payload: { path: call.arguments.path } };
                        }
                        else if (call.name === 'create_file') {
                            fileEvent = { type: 'agent:file:create', payload: { path: call.arguments.path } };
                        }
                        else if (call.name === 'delete_file') {
                            fileEvent = { type: 'agent:file:delete', payload: { path: call.arguments.path } };
                        }
                        else if (call.name === 'rename_file' || call.name === 'move_file') {
                            fileEvent = { type: 'agent:file:rename', payload: { from: call.arguments.from, to: call.arguments.to } };
                        }
                        else if (call.name === 'copy_file') {
                            fileEvent = { type: 'agent:file:create', payload: { path: call.arguments.to } };
                        }
                        if (fileEvent) {
                            options?.onProgress?.({ event: fileEvent });
                        }
                        const result = await executor.execute({
                            id: call.id,
                            name: call.name,
                            args: call.arguments
                        }, true);
                        // Handle verification & diff events
                        if (result.verification) {
                            options?.onProgress?.({ event: { type: 'agent:verification', payload: result.verification } });
                        }
                        if (result.workspaceChange) {
                            this.pendingChanges = this.upsertPendingChange(result.workspaceChange);
                            options?.onProgress?.({
                                pendingChanges: this.getPendingChanges(),
                                event: { type: 'agent:diff', payload: this.getPendingChanges() }
                            });
                        }
                        options?.onProgress?.({ event: { type: 'agent:tool:end', payload: { name: call.name, result } } });
                        workingMessages.push({
                            role: 'tool',
                            name: call.name,
                            toolCallId: call.id,
                            content: result.content
                        });
                    }
                    continue;
                }
                break;
            }
            if (!hasResponded) {
                finalResponse = this.pendingChanges.length
                    ? `Staged ${this.pendingChanges.length} file change${this.pendingChanges.length === 1 ? '' : 's'} for review.`
                    : 'Task completed without a final model response.';
            }
            plan = this.planner.markStep(plan, 'execute', 'completed');
            plan = this.planner.markStep(plan, 'diff', this.pendingChanges.length ? 'completed' : 'pending');
            plan = this.planner.markStep(plan, 'respond', 'completed');
            options?.onProgress?.({
                plan,
                streamingText: undefined,
                event: { type: 'agent:complete', payload: { response: finalResponse } }
            });
            this.memory.add({ role: 'assistant', content: finalResponse });
            return {
                response: finalResponse,
                plan,
                toolActivity: executor.getActivity(),
                pendingChanges: this.getPendingChanges(),
                context
            };
        }
        catch (err) {
            options?.onProgress?.({
                event: { type: 'agent:error', payload: { message: err.message || String(err) } }
            });
            throw err;
        }
    }
    async applyPendingChanges() {
        await this.applyPendingChangeSubset(this.pendingChanges.map((change) => change.id));
    }
    async applyPendingChangeSubset(changeIds) {
        const selectedIds = new Set(changeIds);
        const selectedChanges = this.pendingChanges.filter((change) => selectedIds.has(change.id));
        for (const change of selectedChanges) {
            const target = (0, pathUtils_1.resolveWorkspacePath)(this.workspaceRoot, change.path);
            const parent = vscode.Uri.file(require('path').dirname(target.fsPath));
            switch (change.type) {
                case 'delete':
                    await vscode.workspace.fs.delete(target, { useTrash: true });
                    break;
                case 'rename':
                    if (!change.previousPath) {
                        throw new Error(`Cannot apply rename for ${change.path}: missing previous path.`);
                    }
                    await vscode.workspace.fs.createDirectory(parent);
                    await vscode.workspace.fs.rename((0, pathUtils_1.resolveWorkspacePath)(this.workspaceRoot, change.previousPath), target, { overwrite: false });
                    break;
                case 'mkdir':
                    await vscode.workspace.fs.createDirectory(target);
                    break;
                case 'rmdir':
                    await vscode.workspace.fs.delete(target, { recursive: true, useTrash: true });
                    break;
                case 'create':
                case 'write':
                case 'copy':
                    await vscode.workspace.fs.createDirectory(parent);
                    await vscode.workspace.fs.writeFile(target, Buffer.from(change.nextContent ?? '', 'utf8'));
                    break;
                default:
                    throw new Error(`Unsupported pending change type: ${change.type}`);
            }
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
            'You are Catalyst, a production-grade autonomous AI coding assistant inside VS Code.',
            'CORE RULE: You are NEVER allowed to claim files were edited, updated, created, deleted, renamed, applied, committed, or staged unless the corresponding tool has successfully executed and verification confirms the change.',
            'Reasoning must never be treated as execution. You only plan and call tools; the executor performs the actions and the UI verifies/displays results.',
            'Never claim file changes were applied until the user approves them. Mutating tools only stage changes.',
            'When the user asks you to update, fix, refactor, create, delete, or modify files, you must call the appropriate mutating tool before giving a final answer.',
            'Do not end a response with unfinished process language such as "let me check", "let me verify", "now I will", or "I should"; either call a tool or provide a final concise result.',
            'If you discover documentation or code inaccuracies during analysis, stage the correction with a file tool instead of only describing the issue.',
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