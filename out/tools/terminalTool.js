"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViewLogsTool = exports.BuildProjectTool = exports.RunTestsTool = exports.InstallDependenciesTool = exports.RunTerminalTool = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const base_1 = require("./base");
const commandValidator_1 = require("../utils/commandValidator");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
async function runCommand(command, context) {
    const validation = (0, commandValidator_1.validateTerminalCommand)(command);
    if (!validation.valid) {
        throw new Error(validation.reason ?? 'Command rejected.');
    }
    const { stdout, stderr } = await execAsync(command, {
        cwd: context.workspaceRoot.fsPath,
        timeout: 60_000,
        maxBuffer: 2 * 1024 * 1024
    });
    const content = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    return {
        success: true,
        content: content || 'Command completed with no output.'
    };
}
class TerminalTool extends base_1.BaseTool {
    isMutating = false;
    permissions = [{ id: 'run_terminal', reason: 'run terminal commands' }];
}
class RunTerminalTool extends TerminalTool {
    name = 'run_terminal';
    description = 'Run a validated terminal command in the workspace root.';
    inputSchema = {
        type: 'object',
        properties: {
            command: { type: 'string' }
        },
        required: ['command']
    };
    getAdditionalPermissions(args) {
        const command = String(args.command ?? '');
        const extra = [];
        if (/\b(npm|pnpm|yarn|bun)\s+(install|add|update)\b/i.test(command)) {
            extra.push({ id: 'install_dependencies', reason: `install dependencies using "${command}"` });
        }
        if (/\b(test|vitest|jest|pytest|cargo test|go test|npm run test|pnpm test)\b/i.test(command)) {
            extra.push({ id: 'run_tests', reason: `run tests using "${command}"` });
        }
        if (/\b(build|npm run build|pnpm build|vite build|next build|cargo build|go build)\b/i.test(command)) {
            extra.push({ id: 'build_project', reason: `build the project using "${command}"` });
        }
        if (/\bgit\s+push\b/i.test(command)) {
            extra.push({ id: 'git_push', reason: `push git changes using "${command}"` });
        }
        if (/\bgit\s+commit\b/i.test(command)) {
            extra.push({ id: 'git_commit', reason: `commit git changes using "${command}"` });
        }
        if (/\bgit\s+(checkout|switch|branch)\b/i.test(command)) {
            extra.push({ id: 'git_branch', reason: `change branches using "${command}"` });
        }
        if (/\bgit\s+pull\b/i.test(command)) {
            extra.push({ id: 'git_pull', reason: `pull git changes using "${command}"` });
        }
        return extra;
    }
    async execute(args, context) {
        return runCommand(String(args.command ?? ''), context);
    }
}
exports.RunTerminalTool = RunTerminalTool;
class InstallDependenciesTool extends TerminalTool {
    name = 'install_dependencies';
    description = 'Install dependencies using npm, pnpm, yarn, or bun.';
    inputSchema = {
        type: 'object',
        properties: {
            command: { type: 'string', default: 'npm install' }
        }
    };
    permissions = [
        { id: 'run_terminal', reason: 'run dependency install commands' },
        { id: 'install_dependencies', reason: 'install dependencies' }
    ];
    async execute(args, context) {
        const command = String(args.command ?? 'npm install');
        return runCommand(command, context);
    }
}
exports.InstallDependenciesTool = InstallDependenciesTool;
class RunTestsTool extends TerminalTool {
    name = 'run_tests';
    description = 'Run the project test command.';
    inputSchema = {
        type: 'object',
        properties: {
            command: { type: 'string', default: 'npm test' }
        }
    };
    permissions = [
        { id: 'run_terminal', reason: 'run test commands' },
        { id: 'run_tests', reason: 'run project tests' }
    ];
    async execute(args, context) {
        const command = String(args.command ?? 'npm test');
        return runCommand(command, context);
    }
}
exports.RunTestsTool = RunTestsTool;
class BuildProjectTool extends TerminalTool {
    name = 'build_project';
    description = 'Run the project build command.';
    inputSchema = {
        type: 'object',
        properties: {
            command: { type: 'string', default: 'npm run build' }
        }
    };
    permissions = [
        { id: 'run_terminal', reason: 'run build commands' },
        { id: 'build_project', reason: 'build the project' }
    ];
    async execute(args, context) {
        const command = String(args.command ?? 'npm run build');
        return runCommand(command, context);
    }
}
exports.BuildProjectTool = BuildProjectTool;
class ViewLogsTool extends TerminalTool {
    name = 'view_logs';
    description = 'Read logs or command output via a terminal command.';
    inputSchema = {
        type: 'object',
        properties: {
            command: { type: 'string', default: 'git status' }
        }
    };
    async execute(args, context) {
        return runCommand(String(args.command ?? 'git status'), context);
    }
}
exports.ViewLogsTool = ViewLogsTool;
//# sourceMappingURL=terminalTool.js.map