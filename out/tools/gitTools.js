"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitPullTool = exports.GitPushTool = exports.GitBranchTool = exports.GitCommitTool = exports.GitDiffTool = exports.GitStatusTool = void 0;
const base_1 = require("./base");
const terminalTool_1 = require("./terminalTool");
async function executeGit(command, context) {
    const runner = new terminalTool_1.RunTerminalTool();
    return runner.execute({ command }, context);
}
class GitTool extends base_1.BaseTool {
    isMutating = false;
    inputSchema = {
        type: 'object',
        properties: {}
    };
}
class GitStatusTool extends GitTool {
    name = 'git_status';
    description = 'Show git status for the current workspace.';
    permissions = [{ id: 'run_terminal', reason: 'run git status' }];
    async execute(_args, context) {
        return executeGit('git status --short --branch', context);
    }
}
exports.GitStatusTool = GitStatusTool;
class GitDiffTool extends GitTool {
    name = 'git_diff';
    description = 'Show git diff for the current workspace.';
    permissions = [{ id: 'run_terminal', reason: 'run git diff' }];
    async execute(_args, context) {
        return executeGit('git diff -- .', context);
    }
}
exports.GitDiffTool = GitDiffTool;
class GitCommitTool extends GitTool {
    name = 'git_commit';
    description = 'Create a git commit with a message.';
    inputSchema = {
        type: 'object',
        properties: {
            message: { type: 'string' }
        },
        required: ['message']
    };
    permissions = [
        { id: 'run_terminal', reason: 'run git commit' },
        { id: 'git_commit', reason: 'create git commits' }
    ];
    async execute(args, context) {
        const message = String(args.message ?? '');
        return executeGit(`git commit -m "${message.replace(/"/g, '\\"')}"`, context);
    }
}
exports.GitCommitTool = GitCommitTool;
class GitBranchTool extends GitTool {
    name = 'git_branch';
    description = 'Create or switch a git branch.';
    inputSchema = {
        type: 'object',
        properties: {
            command: { type: 'string', default: 'git branch' }
        }
    };
    permissions = [
        { id: 'run_terminal', reason: 'run git branch commands' },
        { id: 'git_branch', reason: 'manage git branches' }
    ];
    async execute(args, context) {
        return executeGit(String(args.command ?? 'git branch'), context);
    }
}
exports.GitBranchTool = GitBranchTool;
class GitPushTool extends GitTool {
    name = 'git_push';
    description = 'Push changes to the current remote.';
    inputSchema = {
        type: 'object',
        properties: {
            command: { type: 'string', default: 'git push' }
        }
    };
    permissions = [
        { id: 'run_terminal', reason: 'run git push' },
        { id: 'git_push', reason: 'push git changes to a remote' }
    ];
    async execute(args, context) {
        return executeGit(String(args.command ?? 'git push'), context);
    }
}
exports.GitPushTool = GitPushTool;
class GitPullTool extends GitTool {
    name = 'git_pull';
    description = 'Pull changes from the current remote.';
    inputSchema = {
        type: 'object',
        properties: {
            command: { type: 'string', default: 'git pull' }
        }
    };
    permissions = [
        { id: 'run_terminal', reason: 'run git pull' },
        { id: 'git_pull', reason: 'pull git changes from a remote' }
    ];
    async execute(args, context) {
        return executeGit(String(args.command ?? 'git pull'), context);
    }
}
exports.GitPullTool = GitPullTool;
//# sourceMappingURL=gitTools.js.map