import * as vscode from 'vscode';
import { ToolActivityEntry, ToolExecutionContext, ToolInvocation, ToolResult } from '../types';
import { PermissionService } from '../services/permissionService';
import { ToolRegistry } from './toolRegistry';

export class ToolExecutor {
  private readonly activity: ToolActivityEntry[] = [];

  public constructor(
    private readonly registry: ToolRegistry,
    private readonly workspaceRoot: vscode.Uri,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly permissionService: PermissionService,
    private readonly onActivity?: (activity: ToolActivityEntry[]) => void
  ) {}

  public getActivity(): ToolActivityEntry[] {
    return [...this.activity];
  }

  public async execute(invocation: ToolInvocation, previewOnly: boolean): Promise<ToolResult> {
    const tool = this.registry.get(invocation.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${invocation.name}`);
    }

    this.pushActivity(invocation.name, 'started', `Running with args ${JSON.stringify(invocation.args)}`);

    try {
      const authorization = await this.permissionService.ensureAllowed(
        [...tool.permissions, ...(tool.getAdditionalPermissions?.(invocation.args) ?? [])],
        invocation.name
      );

      if (!authorization.allowed) {
        this.pushActivity(invocation.name, 'blocked', authorization.reason ?? 'Blocked by permission policy.');
        throw new Error(authorization.reason ?? 'Blocked by permission policy.');
      }

      const context: ToolExecutionContext = {
        workspaceRoot: this.workspaceRoot,
        previewOnly: previewOnly && tool.isMutating,
        outputChannel: this.outputChannel
      };

      const result = await tool.execute(invocation.args, context);
      this.pushActivity(invocation.name, 'completed', result.content.slice(0, 200));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.pushActivity(invocation.name, 'failed', message);
      throw error;
    }
  }

  private pushActivity(tool: string, status: ToolActivityEntry['status'], summary: string): void {
    this.activity.push({
      timestamp: new Date().toISOString(),
      tool,
      status,
      summary
    });
    this.onActivity?.(this.getActivity());
  }
}
