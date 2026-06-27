import { ToolDefinition } from '../types';

export abstract class BaseTool implements ToolDefinition {
  public abstract readonly name: string;
  public abstract readonly description: string;
  public abstract readonly inputSchema: Record<string, unknown>;
  public abstract readonly isMutating: boolean;
  public abstract readonly permissions: import('../types').PermissionRequest[];
  public getAdditionalPermissions(_args: Record<string, unknown>): import('../types').PermissionRequest[] {
    return [];
  }
  public abstract execute(args: Record<string, unknown>, context: import('../types').ToolExecutionContext): Promise<import('../types').ToolResult>;
}
