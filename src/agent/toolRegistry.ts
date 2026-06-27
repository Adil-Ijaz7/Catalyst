import { OpenRouterToolDefinition, ToolDefinition } from '../types';

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  public register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  public get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public toOpenRouterDefinitions(): OpenRouterToolDefinition[] {
    return this.getAll().map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));
  }
}
