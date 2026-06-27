"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
class ToolRegistry {
    tools = new Map();
    register(tool) {
        this.tools.set(tool.name, tool);
    }
    get(name) {
        return this.tools.get(name);
    }
    getAll() {
        return Array.from(this.tools.values());
    }
    toOpenRouterDefinitions() {
        return this.getAll().map((tool) => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema
            }
        }));
    }
}
exports.ToolRegistry = ToolRegistry;
//# sourceMappingURL=toolRegistry.js.map