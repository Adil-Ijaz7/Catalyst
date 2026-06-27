import * as vscode from 'vscode';
import { BaseTool } from './base';
import { resolveWorkspacePath } from '../utils/pathUtils';
import { PermissionRequest, ToolExecutionContext, ToolResult } from '../types';

export class GetDiagnosticsTool extends BaseTool {
  public readonly name = 'get_diagnostics';
  public readonly description = 'Read VS Code diagnostics for the workspace or a specific file.';
  public readonly inputSchema = {
    type: 'object',
    properties: {
      path: { type: 'string' }
    }
  };
  public readonly isMutating = false;
  public readonly permissions = [{ id: 'read_files', reason: 'inspect workspace diagnostics' }] as PermissionRequest[];

  public async execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> {
    const pathArg = typeof args.path === 'string' ? args.path : undefined;
    const targetUri = pathArg ? resolveWorkspacePath(context.workspaceRoot, pathArg) : undefined;
    const diagnosticsEntries: Array<[vscode.Uri, readonly vscode.Diagnostic[]]> = targetUri
      ? [[targetUri, vscode.languages.getDiagnostics(targetUri)]]
      : vscode.languages.getDiagnostics();

    const entries = diagnosticsEntries.map(([uri, diagnostics]) => ({
      path: vscode.workspace.asRelativePath(uri, false),
      diagnostics: diagnostics.map((diagnostic: vscode.Diagnostic) => ({
        severity: vscode.DiagnosticSeverity[diagnostic.severity],
        message: diagnostic.message,
        source: diagnostic.source,
        range: {
          start: diagnostic.range.start,
          end: diagnostic.range.end
        }
      }))
    }));

    return {
      success: true,
      content: JSON.stringify(entries, null, 2),
      data: entries
    };
  }
}
