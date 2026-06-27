import { createPatch } from 'diff';
import { PendingWorkspaceChangeType } from '../types';

export function buildUnifiedDiff(
  relativePath: string,
  previousContent: string,
  nextContent: string,
  type: PendingWorkspaceChangeType
): string {
  const oldLabel = type === 'create' ? '/dev/null' : `a/${relativePath}`;
  const newLabel = type === 'delete' ? '/dev/null' : `b/${relativePath}`;
  return createPatch(relativePath, previousContent, nextContent, oldLabel, newLabel);
}
