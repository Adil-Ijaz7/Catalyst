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
exports.verifyFileChange = verifyFileChange;
const crypto = __importStar(require("crypto"));
const vscode = __importStar(require("vscode"));
const diffUtils_1 = require("./diffUtils");
const pathUtils_1 = require("./pathUtils");
function computeHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
}
async function verifyFileChange(workspaceRoot, relativePath, mutator, changeType, nextContent, previewOnly) {
    const target = (0, pathUtils_1.resolveWorkspacePath)(workspaceRoot, relativePath);
    // 1. Read original content
    let originalContent = '';
    try {
        const data = await vscode.workspace.fs.readFile(target);
        originalContent = Buffer.from(data).toString('utf8');
    }
    catch (err) {
        // File might not exist yet (e.g. for create)
    }
    // 2. Save original hash
    const originalHash = computeHash(originalContent);
    // 3. Apply edits or get updated content
    let updatedContent = '';
    if (previewOnly) {
        updatedContent = nextContent;
    }
    else {
        await mutator();
        try {
            const data = await vscode.workspace.fs.readFile(target);
            updatedContent = Buffer.from(data).toString('utf8');
        }
        catch (err) {
            // File might be deleted
        }
    }
    // 5. Generate hash
    const updatedHash = computeHash(updatedContent);
    const hashMatch = originalHash === updatedHash;
    // 6. Generate Git-style diff
    const diff = (0, diffUtils_1.buildUnifiedDiff)(relativePath, originalContent, updatedContent, changeType === 'delete' ? 'delete' : changeType === 'create' ? 'create' : 'write');
    // Calculate lines changed
    let linesChanged = 0;
    if (!hashMatch) {
        const diffLines = diff.split('\n');
        for (const line of diffLines) {
            if (line.startsWith('+') && !line.startsWith('+++')) {
                linesChanged++;
            }
            else if (line.startsWith('-') && !line.startsWith('---')) {
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
//# sourceMappingURL=verification.js.map