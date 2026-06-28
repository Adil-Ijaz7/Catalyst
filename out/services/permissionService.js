"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionService = void 0;
const vscode = __importStar(require("vscode"));
const STATE_KEY = 'aiora.permissionModes';
const DEFINITIONS = {
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
class PermissionService {
    context;
    constructor(context) {
        this.context = context;
    }
    getRules() {
        const storedModes = this.context.workspaceState.get(STATE_KEY, {});
        return Object.keys(DEFINITIONS).map((id) => ({
            id,
            label: DEFINITIONS[id].label,
            description: DEFINITIONS[id].description,
            mode: storedModes[id] ?? DEFINITIONS[id].defaultMode,
            source: storedModes[id] ? 'workspace' : 'default'
        }));
    }
    async setMode(id, mode) {
        const storedModes = this.context.workspaceState.get(STATE_KEY, {});
        storedModes[id] = mode;
        await this.context.workspaceState.update(STATE_KEY, storedModes);
    }
    getMode(id) {
        return this.getRules().find((rule) => rule.id === id)?.mode ?? 'deny';
    }
    async ensureAllowed(requests, source) {
        for (const request of requests) {
            const rule = this.getRules().find((entry) => entry.id === request.id);
            if (!rule) {
                return { allowed: false, reason: `Unknown permission: ${request.id}` };
            }
            if (rule.mode === 'deny') {
                return { allowed: false, reason: `${rule.label} is denied by workspace policy.` };
            }
            if (rule.mode === 'ask') {
                const decision = await vscode.window.showWarningMessage(`${source} wants to ${request.reason}.`, { modal: true, detail: `${rule.label}: ${rule.description}` }, 'Allow Once', 'Always Allow', 'Deny');
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
    isNoticeDismissed() {
        return this.context.workspaceState.get('aiora.permissionsNoticeDismissed', false);
    }
    async setNoticeDismissed(dismissed) {
        await this.context.workspaceState.update('aiora.permissionsNoticeDismissed', dismissed);
    }
}
exports.PermissionService = PermissionService;
//# sourceMappingURL=permissionService.js.map