import * as path from 'path';
import * as vscode from 'vscode';
import { BaseTool } from './base';
import { buildUnifiedDiff } from '../utils/diffUtils';
import { resolveWorkspacePath, toRelativeWorkspacePath } from '../utils/pathUtils';
import { PendingWorkspaceChange, PermissionRequest, ToolExecutionContext, ToolResult } from '../types';

async function readTextFile(uri: vscode.Uri): Promise<string> {
  const data = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(data).toString('utf8');
}

async function safeReadTextFile(uri: vscode.Uri): Promise<string> {
  try {
    return await readTextFile(uri);
  } catch {
    return '';
  }
}

function createPendingChange(
  workspaceRoot: vscode.Uri,
  pathUri: vscode.Uri,
  type: PendingWorkspaceChange['type'],
  previousContent: string,
  nextContent: string,
  description: string,
  previousPath?: string
): PendingWorkspaceChange {
  const relativePath = toRelativeWorkspacePath(workspaceRoot, pathUri);
  return {
    id: `${type}:${relativePath}:${Date.now()}`,
    type,
    path: relativePath,
    previousPath,
    previousContent,
    nextContent,
    description,
    diff: buildUnifiedDiff(relativePath, previousContent, nextContent, type === 'rmdir' ? 'delete' : type === 'mkdir' ? 'create' : 'write')
  };
}

function packageManifestPermission(relativePath: string): PermissionRequest[] {
  return /(^|\/)(package|package-lock|pnpm-lock|yarn)\.json$/i.test(relativePath)
    ? [{ id: 'modify_package_json', reason: `modify ${relativePath}` }]
    : [];
}

abstract class WorkspaceTool extends BaseTool {
  protected additionalPermissionsForPath(relativePath: string): PermissionRequest[] {
    return packageManifestPermission(relativePath);
  }
}

export class ReadFileTool extends WorkspaceTool {
  public readonly name = 'read_file';
  public readonly description = 'Read the contents of a UTF-8 text file within the workspace.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative path to the file.' }
    },
    required: ['path']
  };
  public readonly isMutating = false;
  public readonly permissions = [{ id: 'read_files', reason: 'read workspace files' }] as PermissionRequest[];

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const pathArg = String(args.path ?? '');
    const target = resolveWorkspacePath(context.workspaceRoot, pathArg);
    const content = await readTextFile(target);
    return {
      success: true,
      content,
      data: { path: pathArg }
    };
  }
}

export class WriteFileTool extends WorkspaceTool {
  public readonly name = 'write_file';
  public readonly description = 'Modify an existing UTF-8 text file. Changes are staged for approval before apply.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' }
    },
    required: ['path', 'content']
  };
  public readonly isMutating = true;
  public readonly permissions = [{ id: 'modify_files', reason: 'modify existing files' }] as PermissionRequest[];

  public override getAdditionalPermissions(args: Record<string, unknown>): PermissionRequest[] {
    return this.additionalPermissionsForPath(String(args.path ?? ''));
  }

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const pathArg = String(args.path ?? '');
    const content = String(args.content ?? '');
    const target = resolveWorkspacePath(context.workspaceRoot, pathArg);
    const previousContent = await readTextFile(target);
    const pending = createPendingChange(context.workspaceRoot, target, 'write', previousContent, content, `Update ${pathArg}`);

    if (!context.previewOnly) {
      await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
    }

    return {
      success: true,
      content: context.previewOnly ? `Staged update for ${pathArg}` : `Updated ${pathArg}`,
      workspaceChange: pending
    };
  }
}

export class EditFileTool extends WorkspaceTool {
  public readonly name = 'edit_file';
  public readonly description = 'Edit part of a text file by replacing a search string with a replacement string.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string' },
      search: { type: 'string' },
      replace: { type: 'string' }
    },
    required: ['path', 'search', 'replace']
  };
  public readonly isMutating = true;
  public readonly permissions = [{ id: 'modify_files', reason: 'edit existing files' }] as PermissionRequest[];

  public override getAdditionalPermissions(args: Record<string, unknown>): PermissionRequest[] {
    return this.additionalPermissionsForPath(String(args.path ?? ''));
  }

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const pathArg = String(args.path ?? '');
    const search = String(args.search ?? '');
    const replace = String(args.replace ?? '');
    const target = resolveWorkspacePath(context.workspaceRoot, pathArg);
    const previousContent = await readTextFile(target);

    if (!previousContent.includes(search)) {
      throw new Error(`Search text was not found in ${pathArg}.`);
    }

    const nextContent = previousContent.replace(search, replace);
    const pending = createPendingChange(context.workspaceRoot, target, 'write', previousContent, nextContent, `Edit ${pathArg}`);

    if (!context.previewOnly) {
      await vscode.workspace.fs.writeFile(target, Buffer.from(nextContent, 'utf8'));
    }

    return {
      success: true,
      content: context.previewOnly ? `Staged edit for ${pathArg}` : `Edited ${pathArg}`,
      workspaceChange: pending
    };
  }
}

export class CreateFileTool extends WorkspaceTool {
  public readonly name = 'create_file';
  public readonly description = 'Create a new UTF-8 text file. Changes are staged for approval before apply.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' }
    },
    required: ['path', 'content']
  };
  public readonly isMutating = true;
  public readonly permissions = [{ id: 'create_files', reason: 'create new files' }] as PermissionRequest[];

  public override getAdditionalPermissions(args: Record<string, unknown>): PermissionRequest[] {
    return this.additionalPermissionsForPath(String(args.path ?? ''));
  }

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const pathArg = String(args.path ?? '');
    const content = String(args.content ?? '');
    const target = resolveWorkspacePath(context.workspaceRoot, pathArg);
    const pending = createPendingChange(context.workspaceRoot, target, 'create', '', content, `Create ${pathArg}`);

    if (!context.previewOnly) {
      const parent = vscode.Uri.file(path.dirname(target.fsPath));
      await vscode.workspace.fs.createDirectory(parent);
      await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
    }

    return {
      success: true,
      content: context.previewOnly ? `Staged creation for ${pathArg}` : `Created ${pathArg}`,
      workspaceChange: pending
    };
  }
}

export class DeleteFileTool extends WorkspaceTool {
  public readonly name = 'delete_file';
  public readonly description = 'Delete an existing file. Deletion is staged for approval before apply.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string' }
    },
    required: ['path']
  };
  public readonly isMutating = true;
  public readonly permissions = [{ id: 'delete_files', reason: 'delete files' }] as PermissionRequest[];

  public override getAdditionalPermissions(args: Record<string, unknown>): PermissionRequest[] {
    return this.additionalPermissionsForPath(String(args.path ?? ''));
  }

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const pathArg = String(args.path ?? '');
    const target = resolveWorkspacePath(context.workspaceRoot, pathArg);
    const previousContent = await readTextFile(target);
    const pending = createPendingChange(context.workspaceRoot, target, 'delete', previousContent, '', `Delete ${pathArg}`);

    if (!context.previewOnly) {
      await vscode.workspace.fs.delete(target, { useTrash: true });
    }

    return {
      success: true,
      content: context.previewOnly ? `Staged deletion for ${pathArg}` : `Deleted ${pathArg}`,
      workspaceChange: pending
    };
  }
}

export class RenameFileTool extends WorkspaceTool {
  public readonly name = 'rename_file';
  public readonly description = 'Rename an existing file. Operation is staged conceptually before apply.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      from: { type: 'string' },
      to: { type: 'string' }
    },
    required: ['from', 'to']
  };
  public readonly isMutating = true;
  public readonly permissions = [{ id: 'rename_files', reason: 'rename files' }] as PermissionRequest[];

  public override getAdditionalPermissions(args: Record<string, unknown>): PermissionRequest[] {
    return [
      ...this.additionalPermissionsForPath(String(args.from ?? '')),
      ...this.additionalPermissionsForPath(String(args.to ?? ''))
    ];
  }

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const fromArg = String(args.from ?? '');
    const toArg = String(args.to ?? '');
    const source = resolveWorkspacePath(context.workspaceRoot, fromArg);
    const destination = resolveWorkspacePath(context.workspaceRoot, toArg);
    const previousContent = await safeReadTextFile(source);
    const pending = createPendingChange(
      context.workspaceRoot,
      destination,
      'rename',
      previousContent,
      previousContent,
      `Rename ${fromArg} to ${toArg}`,
      fromArg
    );

    if (!context.previewOnly) {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(destination.fsPath)));
      await vscode.workspace.fs.rename(source, destination, { overwrite: false });
    }

    return {
      success: true,
      content: context.previewOnly ? `Staged rename from ${fromArg} to ${toArg}` : `Renamed ${fromArg} to ${toArg}`,
      workspaceChange: pending
    };
  }
}

export class MoveFileTool extends WorkspaceTool {
  public readonly name = 'move_file';
  public readonly description = 'Move a file to another location inside the workspace.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      from: { type: 'string' },
      to: { type: 'string' }
    },
    required: ['from', 'to']
  };
  public readonly isMutating = true;
  public readonly permissions = [{ id: 'rename_files', reason: 'move files inside the workspace' }] as PermissionRequest[];

  public override getAdditionalPermissions(args: Record<string, unknown>): PermissionRequest[] {
    return [
      ...this.additionalPermissionsForPath(String(args.from ?? '')),
      ...this.additionalPermissionsForPath(String(args.to ?? ''))
    ];
  }

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const fromArg = String(args.from ?? '');
    const toArg = String(args.to ?? '');
    const source = resolveWorkspacePath(context.workspaceRoot, fromArg);
    const destination = resolveWorkspacePath(context.workspaceRoot, toArg);
    const previousContent = await safeReadTextFile(source);
    const pending = createPendingChange(
      context.workspaceRoot,
      destination,
      'rename',
      previousContent,
      previousContent,
      `Move ${fromArg} to ${toArg}`,
      fromArg
    );

    if (!context.previewOnly) {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(destination.fsPath)));
      await vscode.workspace.fs.rename(source, destination, { overwrite: false });
    }

    return {
      success: true,
      content: context.previewOnly ? `Staged move from ${fromArg} to ${toArg}` : `Moved ${fromArg} to ${toArg}`,
      workspaceChange: pending
    };
  }
}

export class CopyFileTool extends WorkspaceTool {
  public readonly name = 'copy_file';
  public readonly description = 'Copy a file to another location. Operation is staged before apply.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      from: { type: 'string' },
      to: { type: 'string' }
    },
    required: ['from', 'to']
  };
  public readonly isMutating = true;
  public readonly permissions = [{ id: 'create_files', reason: 'copy files into the workspace' }] as PermissionRequest[];

  public override getAdditionalPermissions(args: Record<string, unknown>): PermissionRequest[] {
    return [
      { id: 'read_files', reason: `read ${String(args.from ?? '')}` },
      ...this.additionalPermissionsForPath(String(args.to ?? ''))
    ];
  }

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const fromArg = String(args.from ?? '');
    const toArg = String(args.to ?? '');
    const source = resolveWorkspacePath(context.workspaceRoot, fromArg);
    const destination = resolveWorkspacePath(context.workspaceRoot, toArg);
    const content = await safeReadTextFile(source);
    const pending = createPendingChange(context.workspaceRoot, destination, 'copy', '', content, `Copy ${fromArg} to ${toArg}`, fromArg);

    if (!context.previewOnly) {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(destination.fsPath)));
      await vscode.workspace.fs.copy(source, destination, { overwrite: false });
    }

    return {
      success: true,
      content: context.previewOnly ? `Staged copy from ${fromArg} to ${toArg}` : `Copied ${fromArg} to ${toArg}`,
      workspaceChange: pending
    };
  }
}

export class CreateDirectoryTool extends WorkspaceTool {
  public readonly name = 'create_directory';
  public readonly description = 'Create a directory within the workspace.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string' }
    },
    required: ['path']
  };
  public readonly isMutating = true;
  public readonly permissions = [{ id: 'create_directories', reason: 'create directories' }] as PermissionRequest[];

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const pathArg = String(args.path ?? '');
    const target = resolveWorkspacePath(context.workspaceRoot, pathArg);
    const pending = createPendingChange(context.workspaceRoot, target, 'mkdir', '', '', `Create directory ${pathArg}`);

    if (!context.previewOnly) {
      await vscode.workspace.fs.createDirectory(target);
    }

    return {
      success: true,
      content: context.previewOnly ? `Staged directory creation for ${pathArg}` : `Created directory ${pathArg}`,
      workspaceChange: pending
    };
  }
}

export class DeleteDirectoryTool extends WorkspaceTool {
  public readonly name = 'delete_directory';
  public readonly description = 'Delete a directory recursively. This is always treated as high risk.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string' }
    },
    required: ['path']
  };
  public readonly isMutating = true;
  public readonly permissions = [
    { id: 'delete_directories', reason: 'delete directories' },
    { id: 'dangerous_delete', reason: 'perform recursive directory deletes' }
  ] as PermissionRequest[];

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const pathArg = String(args.path ?? '');
    const target = resolveWorkspacePath(context.workspaceRoot, pathArg);
    const pending = createPendingChange(context.workspaceRoot, target, 'rmdir', '', '', `Delete directory ${pathArg}`);

    if (!context.previewOnly) {
      await vscode.workspace.fs.delete(target, { recursive: true, useTrash: true });
    }

    return {
      success: true,
      content: context.previewOnly ? `Staged directory deletion for ${pathArg}` : `Deleted directory ${pathArg}`,
      workspaceChange: pending
    };
  }
}

export class SearchFilesTool extends WorkspaceTool {
  public readonly name = 'search_files';
  public readonly description = 'Search UTF-8 text files in the workspace for a literal text query.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      query: { type: 'string' },
      glob: { type: 'string' }
    },
    required: ['query']
  };
  public readonly isMutating = false;
  public readonly permissions = [{ id: 'read_files', reason: 'search files in the workspace' }] as PermissionRequest[];

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const query = String(args.query ?? '');
    const glob = String(args.glob ?? '**/*');
    const uris = await vscode.workspace.findFiles(glob, '**/{node_modules,.git,out,dist,.vscode-test}/**', 100);
    const matches: Array<{ path: string; line: number; preview: string }> = [];

    for (const uri of uris) {
      try {
        const content = await readTextFile(uri);
        const lines = content.split(/\r?\n/);
        lines.forEach((line, index) => {
          if (line.includes(query)) {
            matches.push({
              path: toRelativeWorkspacePath(context.workspaceRoot, uri),
              line: index + 1,
              preview: line.trim()
            });
          }
        });
      } catch {
        // Skip binary or unreadable files.
      }

      if (matches.length >= 100) {
        break;
      }
    }

    return {
      success: true,
      content: JSON.stringify(matches, null, 2),
      data: matches
    };
  }
}

export class GlobFilesTool extends WorkspaceTool {
  public readonly name = 'glob_files';
  public readonly description = 'List files matching a glob pattern.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      pattern: { type: 'string' }
    },
    required: ['pattern']
  };
  public readonly isMutating = false;
  public readonly permissions = [{ id: 'read_files', reason: 'list files in the workspace' }] as PermissionRequest[];

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const pattern = String(args.pattern ?? '**/*');
    const files = await vscode.workspace.findFiles(pattern, '**/{node_modules,.git,out,dist,.vscode-test}/**', 200);
    const data = files.map((uri) => toRelativeWorkspacePath(context.workspaceRoot, uri));
    return {
      success: true,
      content: JSON.stringify(data, null, 2),
      data
    };
  }
}

export class ListDirectoryTool extends WorkspaceTool {
  public readonly name = 'list_directory';
  public readonly description = 'List the contents of a workspace-relative directory.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string' }
    }
  };
  public readonly isMutating = false;
  public readonly permissions = [{ id: 'read_files', reason: 'list directories in the workspace' }] as PermissionRequest[];

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const pathArg = String(args.path ?? '.');
    const target = resolveWorkspacePath(context.workspaceRoot, pathArg);
    const entries = await vscode.workspace.fs.readDirectory(target);
    const data = entries.map(([name, fileType]) => ({
      name,
      type: fileType === vscode.FileType.Directory ? 'directory' : 'file'
    }));

    return {
      success: true,
      content: JSON.stringify(data, null, 2),
      data
    };
  }
}
