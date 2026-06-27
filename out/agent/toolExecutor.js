"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolExecutor = void 0;
class ToolExecutor {
    registry;
    workspaceRoot;
    outputChannel;
    permissionService;
    onActivity;
    activity = [];
    constructor(registry, workspaceRoot, outputChannel, permissionService, onActivity) {
        this.registry = registry;
        this.workspaceRoot = workspaceRoot;
        this.outputChannel = outputChannel;
        this.permissionService = permissionService;
        this.onActivity = onActivity;
    }
    getActivity() {
        return [...this.activity];
    }
    async execute(invocation, previewOnly) {
        const tool = this.registry.get(invocation.name);
        if (!tool) {
            throw new Error(`Unknown tool: ${invocation.name}`);
        }
        this.pushActivity(invocation.name, 'started', `Running with args ${JSON.stringify(invocation.args)}`);
        try {
            const authorization = await this.permissionService.ensureAllowed([...tool.permissions, ...(tool.getAdditionalPermissions?.(invocation.args) ?? [])], invocation.name);
            if (!authorization.allowed) {
                this.pushActivity(invocation.name, 'blocked', authorization.reason ?? 'Blocked by permission policy.');
                throw new Error(authorization.reason ?? 'Blocked by permission policy.');
            }
            const context = {
                workspaceRoot: this.workspaceRoot,
                previewOnly: previewOnly && tool.isMutating,
                outputChannel: this.outputChannel
            };
            const result = await tool.execute(invocation.args, context);
            this.pushActivity(invocation.name, 'completed', result.content.slice(0, 200));
            return result;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.pushActivity(invocation.name, 'failed', message);
            throw error;
        }
    }
    pushActivity(tool, status, summary) {
        this.activity.push({
            timestamp: new Date().toISOString(),
            tool,
            status,
            summary
        });
        this.onActivity?.(this.getActivity());
    }
}
exports.ToolExecutor = ToolExecutor;
//# sourceMappingURL=toolExecutor.js.map