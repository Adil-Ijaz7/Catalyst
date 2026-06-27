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
exports.PendingChangeDiffProvider = void 0;
const vscode = __importStar(require("vscode"));
class PendingChangeDiffProvider {
    static scheme = 'aiora-diff';
    emitter = new vscode.EventEmitter();
    content = new Map();
    onDidChange = this.emitter.event;
    provideTextDocumentContent(uri) {
        return this.content.get(uri.toString()) ?? '';
    }
    async showChange(change) {
        const beforeUri = this.buildUri(change, 'before');
        const afterUri = this.buildUri(change, 'after');
        this.content.set(beforeUri.toString(), change.previousContent ?? '');
        this.content.set(afterUri.toString(), change.nextContent ?? '');
        this.emitter.fire(beforeUri);
        this.emitter.fire(afterUri);
        await vscode.commands.executeCommand('vscode.diff', beforeUri, afterUri, `Aiora Diff: ${change.path}`);
    }
    dispose() {
        this.content.clear();
        this.emitter.dispose();
    }
    buildUri(change, side) {
        return vscode.Uri.parse(`${PendingChangeDiffProvider.scheme}:${change.path.replace(/#/g, '%23')}?side=${side}&change=${encodeURIComponent(change.id)}`);
    }
}
exports.PendingChangeDiffProvider = PendingChangeDiffProvider;
//# sourceMappingURL=pendingChangeDiffProvider.js.map