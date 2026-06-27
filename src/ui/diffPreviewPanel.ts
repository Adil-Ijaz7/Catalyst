import * as vscode from 'vscode';
import { PendingWorkspaceChange } from '../types';

export class DiffPreviewPanel {
  private panel: vscode.WebviewPanel | undefined;

  public constructor(private readonly extensionUri: vscode.Uri) {}

  public show(changes: PendingWorkspaceChange[]): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'aioraCodeAgent.diffPreview',
        'Aiora Diff Preview',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    }

    this.panel.webview.html = this.render(changes);
    this.panel.reveal(vscode.ViewColumn.Beside);
  }

  private render(changes: PendingWorkspaceChange[]): string {
    const content = changes.length
      ? changes
          .map(
            (change) => `
              <section class="diff-card">
                <h2>${escapeHtml(change.path)}</h2>
                <p>${escapeHtml(change.description)}</p>
                <pre>${escapeHtml(change.diff)}</pre>
              </section>
            `
          )
          .join('\n')
      : '<p>No pending changes.</p>';

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Aiora Diff Preview</title>
        <style>
          body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 16px; }
          .diff-card { border: 1px solid var(--vscode-panel-border); border-radius: 12px; padding: 16px; margin-bottom: 16px; background: color-mix(in srgb, var(--vscode-editor-background) 92%, white); }
          h2 { margin: 0 0 8px; font-size: 16px; }
          p { margin: 0 0 12px; color: var(--vscode-descriptionForeground); }
          pre { white-space: pre-wrap; overflow-x: auto; padding: 12px; border-radius: 8px; background: var(--vscode-textCodeBlock-background); }
        </style>
      </head>
      <body>${content}</body>
      </html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
