import * as vscode from 'vscode';
import { PendingWorkspaceChange } from '../types';

type PendingChangeSide = 'before' | 'after';

export class PendingChangeDiffProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
  public static readonly scheme = 'aiora-diff';

  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  private readonly content = new Map<string, string>();

  public readonly onDidChange = this.emitter.event;

  public provideTextDocumentContent(uri: vscode.Uri): string {
    return this.content.get(uri.toString()) ?? '';
  }

  public async showChange(change: PendingWorkspaceChange): Promise<void> {
    const beforeUri = this.buildUri(change, 'before');
    const afterUri = this.buildUri(change, 'after');

    this.content.set(beforeUri.toString(), change.previousContent ?? '');
    this.content.set(afterUri.toString(), change.nextContent ?? '');
    this.emitter.fire(beforeUri);
    this.emitter.fire(afterUri);

    await vscode.commands.executeCommand(
      'vscode.diff',
      beforeUri,
      afterUri,
      `Aiora Diff: ${change.path}`
    );
  }

  public dispose(): void {
    this.content.clear();
    this.emitter.dispose();
  }

  private buildUri(change: PendingWorkspaceChange, side: PendingChangeSide): vscode.Uri {
    return vscode.Uri.parse(
      `${PendingChangeDiffProvider.scheme}:${change.path.replace(/#/g, '%23')}?side=${side}&change=${encodeURIComponent(change.id)}`
    );
  }
}
