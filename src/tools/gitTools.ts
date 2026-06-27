import { BaseTool } from './base';
import { PermissionRequest, ToolExecutionContext, ToolResult } from '../types';
import { RunTerminalTool } from './terminalTool';

async function executeGit(command: string, context: ToolExecutionContext): Promise<ToolResult> {
  const runner = new RunTerminalTool();
  return runner.execute({ command }, context);
}

abstract class GitTool extends BaseTool {
  public readonly isMutating = false;
  public readonly inputSchema = {
    type: 'object',
    properties: {}
  };
}

export class GitStatusTool extends GitTool {
  public readonly name = 'git_status';
  public readonly description = 'Show git status for the current workspace.';
  public readonly permissions = [{ id: 'run_terminal', reason: 'run git status' }] as PermissionRequest[];

  public async execute(_args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    return executeGit('git status --short --branch', context);
  }
}

export class GitDiffTool extends GitTool {
  public readonly name = 'git_diff';
  public readonly description = 'Show git diff for the current workspace.';
  public readonly permissions = [{ id: 'run_terminal', reason: 'run git diff' }] as PermissionRequest[];

  public async execute(_args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    return executeGit('git diff -- .', context);
  }
}

export class GitCommitTool extends GitTool {
  public readonly name = 'git_commit';
  public readonly description = 'Create a git commit with a message.';
  public override readonly inputSchema = {
    type: 'object',
    properties: {
      message: { type: 'string' }
    },
    required: ['message']
  };
  public readonly permissions = [
    { id: 'run_terminal', reason: 'run git commit' },
    { id: 'git_commit', reason: 'create git commits' }
  ] as PermissionRequest[];

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const message = String(args.message ?? '');
    return executeGit(`git commit -m "${message.replace(/"/g, '\\"')}"`, context);
  }
}

export class GitBranchTool extends GitTool {
  public readonly name = 'git_branch';
  public readonly description = 'Create or switch a git branch.';
  public override readonly inputSchema = {
    type: 'object',
    properties: {
      command: { type: 'string', default: 'git branch' }
    }
  };
  public readonly permissions = [
    { id: 'run_terminal', reason: 'run git branch commands' },
    { id: 'git_branch', reason: 'manage git branches' }
  ] as PermissionRequest[];

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    return executeGit(String(args.command ?? 'git branch'), context);
  }
}

export class GitPushTool extends GitTool {
  public readonly name = 'git_push';
  public readonly description = 'Push changes to the current remote.';
  public override readonly inputSchema = {
    type: 'object',
    properties: {
      command: { type: 'string', default: 'git push' }
    }
  };
  public readonly permissions = [
    { id: 'run_terminal', reason: 'run git push' },
    { id: 'git_push', reason: 'push git changes to a remote' }
  ] as PermissionRequest[];

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    return executeGit(String(args.command ?? 'git push'), context);
  }
}

export class GitPullTool extends GitTool {
  public readonly name = 'git_pull';
  public readonly description = 'Pull changes from the current remote.';
  public override readonly inputSchema = {
    type: 'object',
    properties: {
      command: { type: 'string', default: 'git pull' }
    }
  };
  public readonly permissions = [
    { id: 'run_terminal', reason: 'run git pull' },
    { id: 'git_pull', reason: 'pull git changes from a remote' }
  ] as PermissionRequest[];

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    return executeGit(String(args.command ?? 'git pull'), context);
  }
}
