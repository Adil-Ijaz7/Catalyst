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
exports.ContextManager = void 0;
const vscode = __importStar(require("vscode"));
async function readText(uri) {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
}
function extractKeywords(prompt) {
    return Array.from(new Set(prompt
        .toLowerCase()
        .split(/[^a-z0-9_./-]+/g)
        .filter((word) => word.length >= 3))).slice(0, 12);
}
class ContextManager {
    async buildSnapshot(workspaceRoot, prompt, maxFiles) {
        const keywords = extractKeywords(prompt);
        const uris = await vscode.workspace.findFiles('**/*', '**/{node_modules,.git,out,dist}/**', 200);
        const scored = [];
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
            }
            catch {
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
exports.ContextManager = ContextManager;
//# sourceMappingURL=contextManager.js.map