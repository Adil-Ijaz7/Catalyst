import * as vscode from 'vscode';
import {
  AgentRunOptions,
  AgentRunResult,
  ChatMessage,
  OpenRouterResponseMessage,
  PendingWorkspaceChange,
  ToolCall
} from '../types';
import { Planner } from './planner';
import { ContextManager } from './contextManager';
import { ConversationMemory } from './conversationMemory';
import { ToolExecutor } from './toolExecutor';
import { ToolRegistry } from './toolRegistry';
import { OpenRouterService } from '../services/openRouterService';
import { PermissionService } from '../services/permissionService';
import { resolveWorkspacePath } from '../utils/pathUtils';

export class AgentOrchestrator {
  private pendingChanges: PendingWorkspaceChange[] = [];

  public constructor(
    private readonly workspaceRoot: vscode.Uri,
    private readonly planner: Planner,
    private readonly contextManager: ContextManager,
    private readonly memory: ConversationMemory,
    private readonly toolRegistry: ToolRegistry,
    private readonly openRouterService: OpenRouterService,
    private readonly permissionService: PermissionService,
    private readonly outputChannel: vscode.OutputChannel
  ) {}

  public getPendingChanges(): PendingWorkspaceChange[] {
    return [...this.pendingChanges];
  }

  public clearPendingChanges(): void {
    this.pendingChanges = [];
  }

  public resetConversation(): void {
    this.memory.clear();
    this.clearPendingChanges();
  }

  public async run(prompt: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    const settings = await this.openRouterService.getSettings();
    let plan = this.planner.createPlan(prompt);
    const context = await this.contextManager.buildSnapshot(this.workspaceRoot, prompt, settings.maxContextFiles);
    plan = this.planner.markStep(plan, 'discover', 'completed');
    plan = this.planner.markStep(plan, 'analyze', 'completed');
    plan = this.planner.markStep(plan, 'execute', 'in_progress');
    options?.onProgress?.({ plan });

    const executor = new ToolExecutor(this.toolRegistry, this.workspaceRoot, this.outputChannel, this.permissionService, (toolActivity) => {
      options?.onProgress?.({ toolActivity });
    });
    const systemPrompt = this.buildSystemPrompt(context.workspaceRoot, settings.allowTerminalCommands);
    const contextPrompt = this.buildContextPrompt(context);

    this.memory.add({ role: 'user', content: prompt });

    const workingMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.memory.getAll(),
      { role: 'system', content: contextPrompt }
    ];

    let finalResponse = 'No response generated.';

    for (let iteration = 0; iteration < settings.maxIterations; iteration += 1) {
      const response = await this.openRouterService.chat(
        workingMessages,
        this.toolRegistry.toOpenRouterDefinitions(),
        (_delta, aggregate) => {
          options?.onProgress?.({ streamingText: aggregate });
        }
      );

      const assistantMessage = this.toAssistantMessage(response);
      workingMessages.push(assistantMessage);

      if (assistantMessage.toolCalls?.length) {
        for (const call of assistantMessage.toolCalls) {
          const result = await executor.execute(
            {
              id: call.id,
              name: call.name,
              args: call.arguments
            },
            true
          );

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

  public async applyPendingChanges(): Promise<void> {
    await this.applyPendingChangeSubset(this.pendingChanges.map((change) => change.id));
  }

  public async applyPendingChangeSubset(changeIds: string[]): Promise<void> {
    const selectedIds = new Set(changeIds);
    const selectedChanges = this.pendingChanges.filter((change) => selectedIds.has(change.id));

    for (const change of selectedChanges) {
      const target = resolveWorkspacePath(this.workspaceRoot, change.path);
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

  public discardPendingChangeSubset(changeIds: string[]): void {
    const removedIds = new Set(changeIds);
    this.pendingChanges = this.pendingChanges.filter((change) => !removedIds.has(change.id));
  }

  public getPendingChangeById(changeId: string): PendingWorkspaceChange | undefined {
    return this.pendingChanges.find((change) => change.id === changeId);
  }

  private buildSystemPrompt(workspaceRoot: string, allowTerminalCommands: boolean): string {
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

  private buildContextPrompt(context: AgentRunResult['context']): string {
    if (!context.relevantFiles.length) {
      return 'No especially relevant files were discovered yet.';
    }

    const parts = context.relevantFiles.map((file) => {
      return `File: ${file.path}\nScore: ${file.score}\nExcerpt:\n${file.excerpt}`;
    });

    return `Relevant workspace context:\n\n${parts.join('\n\n')}`;
  }

  private toAssistantMessage(message: OpenRouterResponseMessage): ChatMessage {
    const toolCalls: ToolCall[] | undefined = message.tool_calls?.map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>
    }));

    return {
      role: 'assistant',
      content: message.content ?? '',
      toolCalls
    };
  }

  private upsertPendingChange(change: PendingWorkspaceChange): PendingWorkspaceChange[] {
    const remaining = this.pendingChanges.filter((entry) => entry.path !== change.path);
    remaining.push(change);
    return remaining;
  }
}
