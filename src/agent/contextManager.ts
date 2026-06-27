import * as vscode from 'vscode';
import { AgentContextSnapshot, ContextFile } from '../types';

async function readText(uri: vscode.Uri): Promise<string> {
  const bytes = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(bytes).toString('utf8');
}

function extractKeywords(prompt: string): string[] {
  return Array.from(
    new Set(
      prompt
        .toLowerCase()
        .split(/[^a-z0-9_./-]+/g)
        .filter((word) => word.length >= 3)
    )
  ).slice(0, 12);
}

export class ContextManager {
  public async buildSnapshot(workspaceRoot: vscode.Uri, prompt: string, maxFiles: number): Promise<AgentContextSnapshot> {
    const keywords = extractKeywords(prompt);
    const uris = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git,out,dist}/**', 200);
    const scored: ContextFile[] = [];

    for (const uri of uris) {
      const relativePath = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, '/');
      let score = keywords.reduce((acc, keyword) => acc + (relativePath.toLowerCase().includes(keyword) ? 5 : 0), 0);

      try {
        const content = await readText(uri);
        score += keywords.reduce((acc, keyword) => acc + (content.toLowerCase().includes(keyword) ? 1 : 0), 0);

        if (score > 0) {
          scored.push({
            path: relativePath,
            excerpt: content.slice(0, 2500),
            score
          });
        }
      } catch {
        // Ignore unreadable files.
      }
    }

    scored.sort((a, b) => b.score - a.score);

    return {
      workspaceRoot: workspaceRoot.fsPath,
      relevantFiles: scored.slice(0, maxFiles)
    };
  }
}
