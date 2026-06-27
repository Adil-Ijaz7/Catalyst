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
exports.GetDiagnosticsTool = void 0;
const vscode = __importStar(require("vscode"));
const base_1 = require("./base");
const pathUtils_1 = require("../utils/pathUtils");
class GetDiagnosticsTool extends base_1.BaseTool {
    name = 'get_diagnostics';
    description = 'Read VS Code diagnostics for the workspace or a specific file.';
    inputSchema = {
        type: 'object',
        properties: {
            path: { type: 'string' }
        }
    };
    isMutating = false;
    permissions = [{ id: 'read_files', reason: 'inspect workspace diagnostics' }];
    async execute(args, context) {
        const pathArg = typeof args.path === 'string' ? args.path : undefined;
        const targetUri = pathArg ? (0, pathUtils_1.resolveWorkspacePath)(context.workspaceRoot, pathArg) : undefined;
        const diagnosticsEntries = targetUri
            ? [[targetUri, vscode.languages.getDiagnostics(targetUri)]]
            : vscode.languages.getDiagnostics();
        const entries = diagnosticsEntries.map(([uri, diagnostics]) => ({
            path: vscode.workspace.asRelativePath(uri, false),
            diagnostics: diagnostics.map((diagnostic) => ({
                severity: vscode.DiagnosticSeverity[diagnostic.severity],
                message: diagnostic.message,
                source: diagnostic.source,
                range: {
                    start: diagnostic.range.start,
                    end: diagnostic.range.end
                }
            }))
        }));
        return {
            success: true,
            content: JSON.stringify(entries, null, 2),
            data: entries
        };
    }
}
exports.GetDiagnosticsTool = GetDiagnosticsTool;
//# sourceMappingURL=diagnosticsTool.js.map