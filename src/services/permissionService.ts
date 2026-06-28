import * as vscode from 'vscode';
import { PermissionId, PermissionMode, PermissionRequest, PermissionRule } from '../types';

const STATE_KEY = 'aiora.permissionModes';

const DEFINITIONS: Record<PermissionId, { label: string; description: string; defaultMode: PermissionMode }> = {
  read_files: {
    label: 'Read files',
    description: 'Read files inside the current workspace.',
    defaultMode: 'ask'
  },
  modify_files: {
    label: 'Modify files',
    description: 'Edit existing files in the workspace.',
    defaultMode: 'ask'
  },
  create_files: {
    label: 'Create files',
    description: 'Create new files in the workspace.',
    defaultMode: 'ask'
  },
  rename_files: {
    label: 'Rename files',
    description: 'Rename or move files in the workspace.',
    defaultMode: 'ask'
  },
  delete_files: {
    label: 'Delete files',
    description: 'Delete files in the workspace.',
    defaultMode: 'ask'
  },
  create_directories: {
    label: 'Create directories',
    description: 'Create directories in the workspace.',
    defaultMode: 'ask'
  },
  delete_directories: {
    label: 'Delete directories',
    description: 'Delete directories in the workspace.',
    defaultMode: 'ask'
  },
  run_terminal: {
    label: 'Run terminal commands',
    description: 'Execute shell commands in the workspace.',
    defaultMode: 'ask'
  },
  install_dependencies: {
    label: 'Install npm packages',
    description: 'Install or update dependencies.',
    defaultMode: 'ask'
  },
  run_tests: {
    label: 'Run tests',
    description: 'Run test commands against the project.',
    defaultMode: 'allow'
  },
  build_project: {
    label: 'Build project',
    description: 'Run project build commands.',
    defaultMode: 'allow'
  },
  git_commit: {
    label: 'Git commit',
    description: 'Create git commits.',
    defaultMode: 'ask'
  },
  git_branch: {
    label: 'Git branch',
    description: 'Create or switch git branches.',
    defaultMode: 'ask'
  },
  git_push: {
    label: 'Git push',
    description: 'Push commits to a remote repository.',
    defaultMode: 'ask'
  },
  git_pull: {
    label: 'Git pull',
    description: 'Pull changes from a remote repository.',
    defaultMode: 'ask'
  },
  network_requests: {
    label: 'Network requests',
    description: 'Fetch remote documentation or APIs.',
    defaultMode: 'ask'
  },
  access_browser: {
    label: 'Access browser',
    description: 'Use browser-capable tooling.',
    defaultMode: 'ask'
  },
  read_environment: {
    label: 'Read environment variables',
    description: 'Read environment variables from the current process.',
    defaultMode: 'ask'
  },
  modify_package_json: {
    label: 'Modify package.json',
    description: 'Change package manifests or scripts.',
    defaultMode: 'ask'
  },
  dangerous_delete: {
    label: 'Dangerous delete',
    description: 'Potentially destructive delete operations such as recursive deletes.',
    defaultMode: 'deny'
  },
  access_ssh: {
    label: 'Access ~/.ssh',
    description: 'Access SSH keys or related configuration.',
    defaultMode: 'deny'
  },
  access_passwords: {
    label: 'Access passwords',
    description: 'Access passwords, credential stores, or secret files.',
    defaultMode: 'deny'
  }
};

export class PermissionService {
  public constructor(private readonly context: vscode.ExtensionContext) {}

  public getRules(): PermissionRule[] {
    const storedModes = this.context.workspaceState.get<Partial<Record<PermissionId, PermissionMode>>>(STATE_KEY, {});
    return (Object.keys(DEFINITIONS) as PermissionId[]).map((id) => ({
      id,
      label: DEFINITIONS[id].label,
      description: DEFINITIONS[id].description,
      mode: storedModes[id] ?? DEFINITIONS[id].defaultMode,
      source: storedModes[id] ? 'workspace' : 'default'
    }));
  }

  public async setMode(id: PermissionId, mode: PermissionMode): Promise<void> {
    const storedModes = this.context.workspaceState.get<Partial<Record<PermissionId, PermissionMode>>>(STATE_KEY, {});
    storedModes[id] = mode;
    await this.context.workspaceState.update(STATE_KEY, storedModes);
  }

  public getMode(id: PermissionId): PermissionMode {
    return this.getRules().find((rule) => rule.id === id)?.mode ?? 'deny';
  }

  public async ensureAllowed(requests: PermissionRequest[], source: string): Promise<{ allowed: boolean; reason?: string }> {
    for (const request of requests) {
      const rule = this.getRules().find((entry) => entry.id === request.id);
      if (!rule) {
        return { allowed: false, reason: `Unknown permission: ${request.id}` };
      }

      if (rule.mode === 'deny') {
        return { allowed: false, reason: `${rule.label} is denied by workspace policy.` };
      }

      if (rule.mode === 'ask') {
        const decision = await vscode.window.showWarningMessage(
          `${source} wants to ${request.reason}.`,
          { modal: true, detail: `${rule.label}: ${rule.description}` },
          'Allow Once',
          'Always Allow',
          'Deny'
        );

        if (!decision || decision === 'Deny') {
          return { allowed: false, reason: `${rule.label} was denied by the user.` };
        }

        if (decision === 'Always Allow') {
          await this.setMode(request.id, 'allow');
        }
      }
    }

    return { allowed: true };
  }

  public isNoticeDismissed(): boolean {
    return this.context.workspaceState.get<boolean>('aiora.permissionsNoticeDismissed', false);
  }

  public async setNoticeDismissed(dismissed: boolean): Promise<void> {
    await this.context.workspaceState.update('aiora.permissionsNoticeDismissed', dismissed);
  }
}
