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
exports.ListDirectoryTool = exports.GlobFilesTool = exports.SearchFilesTool = exports.DeleteDirectoryTool = exports.CreateDirectoryTool = exports.CopyFileTool = exports.MoveFileTool = exports.RenameFileTool = exports.DeleteFileTool = exports.CreateFileTool = exports.EditFileTool = exports.WriteFileTool = exports.ReadFileTool = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const base_1 = require("./base");
const diffUtils_1 = require("../utils/diffUtils");
const pathUtils_1 = require("../utils/pathUtils");
const verification_1 = require("../utils/verification");
async function readTextFile(uri) {
    const data = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(data).toString('utf8');
}
async function safeReadTextFile(uri) {
    try {
        return await readTextFile(uri);
    }
    catch {
        return '';
    }
}
function createPendingChange(workspaceRoot, pathUri, type, previousContent, nextContent, description, previousPath) {
    const relativePath = (0, pathUtils_1.toRelativeWorkspacePath)(workspaceRoot, pathUri);
    return {
        id: `${type}:${relativePath}:${Date.now()}`,
        type,
        path: relativePath,
        previousPath,
        previousContent,
        nextContent,
        description,
        diff: (0, diffUtils_1.buildUnifiedDiff)(relativePath, previousContent, nextContent, type === 'rmdir' ? 'delete' : type === 'mkdir' ? 'create' : 'write')
    };
}
function packageManifestPermission(relativePath) {
    return /(^|\/)(package|package-lock|pnpm-lock|yarn)\.json$/i.test(relativePath)
        ? [{ id: 'modify_package_json', reason: `modify ${relativePath}` }]
        : [];
}
class WorkspaceTool extends base_1.BaseTool {
    additionalPermissionsForPath(relativePath) {
        return packageManifestPermission(relativePath);
    }
}
class ReadFileTool extends WorkspaceTool {
    name = 'read_file';
    description = 'Read the contents of a UTF-8 text file within the workspace.';
    inputSchema = {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'Workspace-relative path to the file.' }
        },
        required: ['path']
    };
    isMutating = false;
    permissions = [{ id: 'read_files', reason: 'read workspace files' }];
    async execute(args, context) {
        const pathArg = String(args.path ?? '');
        const target = (0, pathUtils_1.resolveWorkspacePath)(context.workspaceRoot, pathArg);
        const content = await readTextFile(target);
        return {
            success: true,
            content,
            data: { path: pathArg }
        };
    }
}
exports.ReadFileTool = ReadFileTool;
class WriteFileTool extends WorkspaceTool {
    name = 'write_file';
    description = 'Modify an existing UTF-8 text file. Changes are staged for approval before apply.';
    inputSchema = {
        type: 'object',
        properties: {
            path: { type: 'string' },
            content: { type: 'string' }
        },
        required: ['path', 'content']
    };
    isMutating = true;
    permissions = [{ id: 'modify_files', reason: 'modify existing files' }];
    getAdditionalPermissions(args) {
        return this.additionalPermissionsForPath(String(args.path ?? ''));
    }
    async execute(args, context) {
        const pathArg = String(args.path ?? '');
        const content = String(args.content ?? '');
        const target = (0, pathUtils_1.resolveWorkspacePath)(context.workspaceRoot, pathArg);
        const previousContent = await safeReadTextFile(target);
        const pending = createPendingChange(context.workspaceRoot, target, 'write', previousContent, content, `Update ${pathArg}`);
        const verification = await (0, verification_1.verifyFileChange)(context.workspaceRoot, pathArg, async () => {
            await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
        }, 'write', content, context.previewOnly);
        if (verification.hashMatch && !context.previewOnly) {
            return {
                success: false,
                content: `No changes were applied to ${pathArg}.`,
                verification
            };
        }
        return {
            success: true,
            content: context.previewOnly ? `Staged update for ${pathArg}` : `Updated ${pathArg}`,
            workspaceChange: pending,
            verification
        };
    }
}
exports.WriteFileTool = WriteFileTool;
class EditFileTool extends WorkspaceTool {
    name = 'edit_file';
    description = 'Edit part of a text file by replacing a search string with a replacement string.';
    inputSchema = {
        type: 'object',
        properties: {
            path: { type: 'string' },
            search: { type: 'string' },
            replace: { type: 'string' }
        },
        required: ['path', 'search', 'replace']
    };
    isMutating = true;
    permissions = [{ id: 'modify_files', reason: 'edit existing files' }];
    getAdditionalPermissions(args) {
        return this.additionalPermissionsForPath(String(args.path ?? ''));
    }
    async execute(args, context) {
        const pathArg = String(args.path ?? '');
        const search = String(args.search ?? '');
        const replace = String(args.replace ?? '');
        const target = (0, pathUtils_1.resolveWorkspacePath)(context.workspaceRoot, pathArg);
        const previousContent = await readTextFile(target);
        if (!previousContent.includes(search)) {
            throw new Error(`Search text was not found in ${pathArg}.`);
        }
        const nextContent = previousContent.replace(search, replace);
        const pending = createPendingChange(context.workspaceRoot, target, 'write', previousContent, nextContent, `Edit ${pathArg}`);
        const verification = await (0, verification_1.verifyFileChange)(context.workspaceRoot, pathArg, async () => {
            await vscode.workspace.fs.writeFile(target, Buffer.from(nextContent, 'utf8'));
        }, 'write', nextContent, context.previewOnly);
        if (verification.hashMatch && !context.previewOnly) {
            return {
                success: false,
                content: `No changes were applied to ${pathArg}.`,
                verification
            };
        }
        return {
            success: true,
            content: context.previewOnly ? `Staged edit for ${pathArg}` : `Edited ${pathArg}`,
            workspaceChange: pending,
            verification
        };
    }
}
exports.EditFileTool = EditFileTool;
class CreateFileTool extends WorkspaceTool {
    name = 'create_file';
    description = 'Create a new UTF-8 text file. Changes are staged for approval before apply.';
    inputSchema = {
        type: 'object',
        properties: {
            path: { type: 'string' },
            content: { type: 'string' }
        },
        required: ['path', 'content']
    };
    isMutating = true;
    permissions = [{ id: 'create_files', reason: 'create new files' }];
    getAdditionalPermissions(args) {
        return this.additionalPermissionsForPath(String(args.path ?? ''));
    }
    async execute(args, context) {
        const pathArg = String(args.path ?? '');
        const content = String(args.content ?? '');
        const target = (0, pathUtils_1.resolveWorkspacePath)(context.workspaceRoot, pathArg);
        const pending = createPendingChange(context.workspaceRoot, target, 'create', '', content, `Create ${pathArg}`);
        const verification = await (0, verification_1.verifyFileChange)(context.workspaceRoot, pathArg, async () => {
            const parent = vscode.Uri.file(path.dirname(target.fsPath));
            await vscode.workspace.fs.createDirectory(parent);
            await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));
        }, 'create', content, context.previewOnly);
        if (verification.hashMatch && !context.previewOnly) {
            return {
                success: false,
                content: `No changes were applied to ${pathArg}.`,
                verification
            };
        }
        return {
            success: true,
            content: context.previewOnly ? `Staged creation for ${pathArg}` : `Created ${pathArg}`,
            workspaceChange: pending,
            verification
        };
    }
}
exports.CreateFileTool = CreateFileTool;
class DeleteFileTool extends WorkspaceTool {
    name = 'delete_file';
    description = 'Delete an existing file. Deletion is staged for approval before apply.';
    inputSchema = {
        type: 'object',
        properties: {
            path: { type: 'string' }
        },
        required: ['path']
    };
    isMutating = true;
    permissions = [{ id: 'delete_files', reason: 'delete files' }];
    getAdditionalPermissions(args) {
        return this.additionalPermissionsForPath(String(args.path ?? ''));
    }
    async execute(args, context) {
        const pathArg = String(args.path ?? '');
        const target = (0, pathUtils_1.resolveWorkspacePath)(context.workspaceRoot, pathArg);
        const previousContent = await safeReadTextFile(target);
        const pending = createPendingChange(context.workspaceRoot, target, 'delete', previousContent, '', `Delete ${pathArg}`);
        const verification = await (0, verification_1.verifyFileChange)(context.workspaceRoot, pathArg, async () => {
            await vscode.workspace.fs.delete(target, { useTrash: true });
        }, 'delete', '', context.previewOnly);
        if (verification.hashMatch && !context.previewOnly) {
            return {
                success: false,
                content: `No changes were applied to ${pathArg}.`,
                verification
            };
        }
        return {
            success: true,
            content: context.previewOnly ? `Staged deletion for ${pathArg}` : `Deleted ${pathArg}`,
            workspaceChange: pending,
            verification
        };
    }
}
exports.DeleteFileTool = DeleteFileTool;
class RenameFileTool extends WorkspaceTool {
    name = 'rename_file';
    description = 'Rename an existing file. Operation is staged conceptually before apply.';
    inputSchema = {
        type: 'object',
        properties: {
            from: { type: 'string' },
            to: { type: 'string' }
        },
        required: ['from', 'to']
    };
    isMutating = true;
    permissions = [{ id: 'rename_files', reason: 'rename files' }];
    getAdditionalPermissions(args) {
        return [
            ...this.additionalPermissionsForPath(String(args.from ?? '')),
            ...this.additionalPermissionsForPath(String(args.to ?? ''))
        ];
    }
    async execute(args, context) {
        const fromArg = String(args.from ?? '');
        const toArg = String(args.to ?? '');
        const source = (0, pathUtils_1.resolveWorkspacePath)(context.workspaceRoot, fromArg);
        const destination = (0, pathUtils_1.resolveWorkspacePath)(context.workspaceRoot, toArg);
        const previousContent = await safeReadTextFile(source);
        const pending = createPendingChange(context.workspaceRoot, destination, 'rename', previousContent, previousContent, `Rename ${fromArg} to ${toArg}`, fromArg);
        const verification = await (0, verification_1.verifyFileChange)(context.workspaceRoot, toArg, async () => {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(destination.fsPath)));
            await vscode.workspace.fs.rename(source, destination, { overwrite: false });
        }, 'create', // treat rename as creation at target
        previousContent, context.previewOnly);
        if (verification.hashMatch && !context.previewOnly) {
            return {
                success: false,
                content: `No changes were applied during rename to ${toArg}.`,
                verification
            };
        }
        return {
            success: true,
            content: context.previewOnly ? `Staged rename from ${fromArg} to ${toArg}` : `Renamed ${fromArg} to ${toArg}`,
            workspaceChange: pending,
            verification
        };
    }
}
exports.RenameFileTool = RenameFileTool;
class MoveFileTool extends WorkspaceTool {
    name = 'move_file';
    description = 'Move a file to another location inside the workspace.';
    inputSchema = {
        type: 'object',
        properties: {
            from: { type: 'string' },
            to: { type: 'string' }
        },
        required: ['from', 'to']
    };
    isMutating = true;
    permissions = [{ id: 'rename_files', reason: 'move files inside the workspace' }];
    getAdditionalPermissions(args) {
        return [
            ...this.additionalPermissionsForPath(String(args.from ?? '')),
            ...this.additionalPermissionsForPath(String(args.to ?? ''))
        ];
    }
    async execute(args, context) {
        const fromArg = String(args.from ?? '');
        const toArg = String(args.to ?? '');
        const source = (0, pathUtils_1.resolveWorkspacePath)(context.workspaceRoot, fromArg);
        const destination = (0, pathUtils_1.resolveWorkspacePath)(context.workspaceRoot, toArg);
        const previousContent = await safeReadTextFile(source);
        const pending = createPendingChange(context.workspaceRoot, destination, 'rename', previousContent, previousContent, `Move ${fromArg} to ${toArg}`, fromArg);
        const verification = await (0, verification_1.verifyFileChange)(context.workspaceRoot, toArg, async () => {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(destination.fsPath)));
            await vscode.workspace.fs.rename(source, destination, { overwrite: false });
        }, 'create', previousContent, context.previewOnly);
        if (verification.hashMatch && !context.previewOnly) {
            return {
                success: false,
                content: `No changes were applied during move to ${toArg}.`,
                verification
            };
        }
        return {
            success: true,
            content: context.previewOnly ? `Staged move from ${fromArg} to ${toArg}` : `Moved ${fromArg} to ${toArg}`,
            workspaceChange: pending,
            verification
        };
    }
}
exports.MoveFileTool = MoveFileTool;
class CopyFileTool extends WorkspaceTool {
    name = 'copy_file';
    description = 'Copy a file to another location. Operation is staged before apply.';
    inputSchema = {
        type: 'object',
        properties: {
            from: { type: 'string' },
            to: { type: 'string' }
        },
        required: ['from', 'to']
    };
    isMutating = true;
    permissions = [{ id: 'create_files', reason: 'copy files into the workspace' }];
    getAdditionalPermissions(args) {
        return [
            { id: 'read_files', reason: `read ${String(args.from ?? '')}` },
            ...this.additionalPermissionsForPath(String(args.to ?? ''))
        ];
    }
    async execute(args, context) {
        const fromArg = String(args.from ?? '');
        const toArg = String(args.to ?? '');
        const source = (0, pathUtils_1.resolveWorkspacePath)(context.workspaceRoot, fromArg);
        const destination = (0, pathUtils_1.resolveWorkspacePath)(context.workspaceRoot, toArg);
        const content = await safeReadTextFile(source);
        const pending = createPendingChange(context.workspaceRoot, destination, 'copy', '', content, `Copy ${fromArg} to ${toArg}`, fromArg);
        const verification = await (0, verification_1.verifyFileChange)(context.workspaceRoot, toArg, async () => {
            await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(destination.fsPath)));
            await vscode.workspace.fs.copy(source, destination, { overwrite: false });
        }, 'copy', content, context.previewOnly);
        if (verification.hashMatch && !context.previewOnly) {
            return {
                success: false,
                content: `No changes were applied during copy to ${toArg}.`,
                verification
            };
        }
        return {
            success: true,
            content: context.previewOnly ? `Staged copy from ${fromArg} to ${toArg}` : `Copied ${fromArg} to ${toArg}`,
            workspaceChange: pending,
            verification
        };
    }
}
exports.CopyFileTool = CopyFileTool;
class CreateDirectoryTool extends WorkspaceTool {
    name = 'create_directory';
    description = 'Create a directory within the workspace.';
    inputSchema = {
        type: 'object',
        properties: {
            path: { type: 'string' }
        },
        required: ['path']
    };
    isMutating = true;
    permissions = [{ id: 'create_directories', reason: 'create directories' }];
    async execute(args, context) {
        const pathArg = String(args.path ?? '');
        const target = (0, pathUtils_1.resolveWorkspacePath)(context.workspaceRoot, pathArg);
        const pending = createPendingChange(context.workspaceRoot, target, 'mkdir', '', '', `Create directory ${pathArg}`);
        if (!context.previewOnly) {
            await vscode.workspace.fs.createDirectory(target);
        }
        return {
            success: true,
            content: context.previewOnly ? `Staged directory creation for ${pathArg}` : `Created directory ${pathArg}`,
            workspaceChange: pending
        };
    }
}
exports.CreateDirectoryTool = CreateDirectoryTool;
class DeleteDirectoryTool extends WorkspaceTool {
    name = 'delete_directory';
    description = 'Delete a directory recursively. This is always treated as high risk.';
    inputSchema = {
        type: 'object',
        properties: {
            path: { type: 'string' }
        },
        required: ['path']
    };
    isMutating = true;
    permissions = [
        { id: 'delete_directories', reason: 'delete directories' },
        { id: 'dangerous_delete', reason: 'perform recursive directory deletes' }
    ];
    async execute(args, context) {
        const pathArg = String(args.path ?? '');
        const target = (0, pathUtils_1.resolveWorkspacePath)(context.workspaceRoot, pathArg);
        const pending = createPendingChange(context.workspaceRoot, target, 'rmdir', '', '', `Delete directory ${pathArg}`);
        if (!context.previewOnly) {
            await vscode.workspace.fs.delete(target, { recursive: true, useTrash: true });
        }
        return {
            success: true,
            content: context.previewOnly ? `Staged directory deletion for ${pathArg}` : `Deleted directory ${pathArg}`,
            workspaceChange: pending
        };
    }
}
exports.DeleteDirectoryTool = DeleteDirectoryTool;
class SearchFilesTool extends WorkspaceTool {
    name = 'search_files';
    description = 'Search UTF-8 text files in the workspace for a literal text query.';
    inputSchema = {
        type: 'object',
        properties: {
            query: { type: 'string' },
            glob: { type: 'string' }
        },
        required: ['query']
    };
    isMutating = false;
    permissions = [{ id: 'read_files', reason: 'search files in the workspace' }];
    async execute(args, context) {
        const query = String(args.query ?? '');
        const glob = String(args.glob ?? '**/*');
        const uris = await vscode.workspace.findFiles(glob, '**/{node_modules,.git,out,dist,.vscode-test}/**', 100);
        const matches = [];
        for (const uri of uris) {
            try {
                const content = await readTextFile(uri);
                const lines = content.split(/\r?\n/);
                lines.forEach((line, index) => {
                    if (line.includes(query)) {
                        matches.push({
                            path: (0, pathUtils_1.toRelativeWorkspacePath)(context.workspaceRoot, uri),
                            line: index + 1,
                            preview: line.trim()
                        });
                    }
                });
            }
            catch {
                // Skip binary or unreadable files.
            }
            if (matches.length >= 100) {
                break;
            }
        }
        return {
            success: true,
            content: JSON.stringify(matches, null, 2),
            data: matches
        };
    }
}
exports.SearchFilesTool = SearchFilesTool;
class GlobFilesTool extends WorkspaceTool {
    name = 'glob_files';
    description = 'List files matching a glob pattern.';
    inputSchema = {
        type: 'object',
        properties: {
            pattern: { type: 'string' }
        },
        required: ['pattern']
    };
    isMutating = false;
    permissions = [{ id: 'read_files', reason: 'list files in the workspace' }];
    async execute(args, context) {
        const pattern = String(args.pattern ?? '**/*');
        const files = await vscode.workspace.findFiles(pattern, '**/{node_modules,.git,out,dist,.vscode-test}/**', 200);
        const data = files.map((uri) => (0, pathUtils_1.toRelativeWorkspacePath)(context.workspaceRoot, uri));
        return {
            success: true,
            content: JSON.stringify(data, null, 2),
            data
        };
    }
}
exports.GlobFilesTool = GlobFilesTool;
class ListDirectoryTool extends WorkspaceTool {
    name = 'list_directory';
    description = 'List the contents of a workspace-relative directory.';
    inputSchema = {
        type: 'object',
        properties: {
            path: { type: 'string' }
        }
    };
    isMutating = false;
    permissions = [{ id: 'read_files', reason: 'list directories in the workspace' }];
    async execute(args, context) {
        const pathArg = String(args.path ?? '.');
        const target = (0, pathUtils_1.resolveWorkspacePath)(context.workspaceRoot, pathArg);
        const entries = await vscode.workspace.fs.readDirectory(target);
        const data = entries.map(([name, fileType]) => ({
            name,
            type: fileType === vscode.FileType.Directory ? 'directory' : 'file'
        }));
        return {
            success: true,
            content: JSON.stringify(data, null, 2),
            data
        };
    }
}
exports.ListDirectoryTool = ListDirectoryTool;
//# sourceMappingURL=fileTools.js.map