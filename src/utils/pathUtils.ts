import * as path from 'path';
import * as vscode from 'vscode';

export function resolveWorkspacePath(workspaceRoot: vscode.Uri, requestedPath: string): vscode.Uri {
  const normalizedRoot = path.resolve(workspaceRoot.fsPath);
  const candidate = path.resolve(normalizedRoot, requestedPath);
  const relative = path.relative(normalizedRoot, candidate);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes workspace root: ${requestedPath}`);
  }

  return vscode.Uri.file(candidate);
}

export function toRelativeWorkspacePath(workspaceRoot: vscode.Uri, target: vscode.Uri): string {
  return path.relative(workspaceRoot.fsPath, target.fsPath).replace(/\\/g, '/');
}
