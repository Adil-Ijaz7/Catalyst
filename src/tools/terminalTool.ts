import { exec } from 'child_process';
import { promisify } from 'util';
import { BaseTool } from './base';
import { PermissionRequest, ToolExecutionContext, ToolResult } from '../types';
import { validateTerminalCommand } from '../utils/commandValidator';

const execAsync = promisify(exec);

async function runCommand(command: string, context: ToolExecutionContext): Promise<ToolResult> {
  const validation = validateTerminalCommand(command);
  if (!validation.valid) {
    throw new Error(validation.reason ?? 'Command rejected.');
  }

  const { stdout, stderr } = await execAsync(command, {
    cwd: context.workspaceRoot.fsPath,
    timeout: 60_000,
    maxBuffer: 2 * 1024 * 1024
  });

  const content = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  return {
    success: true,
    content: content || 'Command completed with no output.'
  };
}

abstract class TerminalTool extends BaseTool {
  public readonly isMutating = false;
  public readonly permissions = [{ id: 'run_terminal', reason: 'run terminal commands' }] as PermissionRequest[];
}

export class RunTerminalTool extends TerminalTool {
  public readonly name = 'run_terminal';
  public readonly description = 'Run a validated terminal command in the workspace root.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      command: { type: 'string' }
    },
    required: ['command']
  };

  public override getAdditionalPermissions(args: Record<string, unknown>): PermissionRequest[] {
    const command = String(args.command ?? '');
    const extra: PermissionRequest[] = [];
    if (/\b(npm|pnpm|yarn|bun)\s+(install|add|update)\b/i.test(command)) {
      extra.push({ id: 'install_dependencies', reason: `install dependencies using "${command}"` });
    }
    if (/\b(test|vitest|jest|pytest|cargo test|go test|npm run test|pnpm test)\b/i.test(command)) {
      extra.push({ id: 'run_tests', reason: `run tests using "${command}"` });
    }
    if (/\b(build|npm run build|pnpm build|vite build|next build|cargo build|go build)\b/i.test(command)) {
      extra.push({ id: 'build_project', reason: `build the project using "${command}"` });
    }
    if (/\bgit\s+push\b/i.test(command)) {
      extra.push({ id: 'git_push', reason: `push git changes using "${command}"` });
    }
    if (/\bgit\s+commit\b/i.test(command)) {
      extra.push({ id: 'git_commit', reason: `commit git changes using "${command}"` });
    }
    if (/\bgit\s+(checkout|switch|branch)\b/i.test(command)) {
      extra.push({ id: 'git_branch', reason: `change branches using "${command}"` });
    }
    if (/\bgit\s+pull\b/i.test(command)) {
      extra.push({ id: 'git_pull', reason: `pull git changes using "${command}"` });
    }
    return extra;
  }

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    return runCommand(String(args.command ?? ''), context);
  }
}

export class InstallDependenciesTool extends TerminalTool {
  public readonly name = 'install_dependencies';
  public readonly description = 'Install dependencies using npm, pnpm, yarn, or bun.';
  public override readonly inputSchema = {
    type: 'object',
    properties: {
      command: { type: 'string', default: 'npm install' }
    }
  };
  public override readonly permissions = [
    { id: 'run_terminal', reason: 'run dependency install commands' },
    { id: 'install_dependencies', reason: 'install dependencies' }
  ] as PermissionRequest[];

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const command = String(args.command ?? 'npm install');
    return runCommand(command, context);
  }
}

export class RunTestsTool extends TerminalTool {
  public readonly name = 'run_tests';
  public readonly description = 'Run the project test command.';
  public override readonly inputSchema = {
    type: 'object',
    properties: {
      command: { type: 'string', default: 'npm test' }
    }
  };
  public override readonly permissions = [
    { id: 'run_terminal', reason: 'run test commands' },
    { id: 'run_tests', reason: 'run project tests' }
  ] as PermissionRequest[];

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const command = String(args.command ?? 'npm test');
    return runCommand(command, context);
  }
}

export class BuildProjectTool extends TerminalTool {
  public readonly name = 'build_project';
  public readonly description = 'Run the project build command.';
  public override readonly inputSchema = {
    type: 'object',
    properties: {
      command: { type: 'string', default: 'npm run build' }
    }
  };
  public override readonly permissions = [
    { id: 'run_terminal', reason: 'run build commands' },
    { id: 'build_project', reason: 'build the project' }
  ] as PermissionRequest[];

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const command = String(args.command ?? 'npm run build');
    return runCommand(command, context);
  }
}

export class ViewLogsTool extends TerminalTool {
  public readonly name = 'view_logs';
  public readonly description = 'Read logs or command output via a terminal command.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      command: { type: 'string', default: 'git status' }
    }
  };

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    return runCommand(String(args.command ?? 'git status'), context);
  }
}
