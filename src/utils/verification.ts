import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { VerificationResult } from '../types';
import { buildUnifiedDiff } from './diffUtils';
import { resolveWorkspacePath } from './pathUtils';

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function verifyFileChange(
  workspaceRoot: vscode.Uri,
  relativePath: string,
  mutator: () => Promise<void>,
  changeType: 'create' | 'write' | 'delete' | 'rename' | 'copy',
  nextContent: string,
  previewOnly: boolean
): Promise<VerificationResult> {
  const target = resolveWorkspacePath(workspaceRoot, relativePath);
  
  // 1. Read original content
  let originalContent = '';
  try {
    const data = await vscode.workspace.fs.readFile(target);
    originalContent = Buffer.from(data).toString('utf8');
  } catch (err) {
    // File might not exist yet (e.g. for create)
  }

  // 2. Save original hash
  const originalHash = computeHash(originalContent);

  // 3. Apply edits or get updated content
  let updatedContent = '';
  if (previewOnly) {
    updatedContent = nextContent;
  } else {
    await mutator();
    try {
      const data = await vscode.workspace.fs.readFile(target);
      updatedContent = Buffer.from(data).toString('utf8');
    } catch (err) {
      // File might be deleted
    }
  }

  // 5. Generate hash
  const updatedHash = computeHash(updatedContent);
  const hashMatch = originalHash === updatedHash;

  // 6. Generate Git-style diff
  const diff = buildUnifiedDiff(relativePath, originalContent, updatedContent, changeType === 'delete' ? 'delete' : changeType === 'create' ? 'create' : 'write');

  // Calculate lines changed
  let linesChanged = 0;
  if (!hashMatch) {
    const diffLines = diff.split('\n');
    for (const line of diffLines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        linesChanged++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        linesChanged++;
      }
    }
  }

  return {
    success: !hashMatch,
    hashMatch,
    originalHash,
    updatedHash,
    linesChanged,
    diff
  };
}
