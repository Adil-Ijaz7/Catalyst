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
exports.DiffPreviewPanel = void 0;
const vscode = __importStar(require("vscode"));
class DiffPreviewPanel {
    extensionUri;
    panel;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    show(changes) {
        if (!this.panel) {
            this.panel = vscode.window.createWebviewPanel('aioraCodeAgent.diffPreview', 'Aiora Diff Preview', vscode.ViewColumn.Beside, {
                enableScripts: true
            });
            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
        }
        this.panel.webview.html = this.render(changes);
        this.panel.reveal(vscode.ViewColumn.Beside);
    }
    render(changes) {
        const content = changes.length
            ? changes
                .map((change) => `
              <section class="diff-card">
                <h2>${escapeHtml(change.path)}</h2>
                <p>${escapeHtml(change.description)}</p>
                <pre>${escapeHtml(change.diff)}</pre>
              </section>
            `)
                .join('\n')
            : '<p>No pending changes.</p>';
        return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Aiora Diff Preview</title>
        <style>
          body { font-family: var(--vscode-font-family); background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); padding: 16px; }
          .diff-card { border: 1px solid var(--vscode-panel-border); border-radius: 12px; padding: 16px; margin-bottom: 16px; background: color-mix(in srgb, var(--vscode-editor-background) 92%, white); }
          h2 { margin: 0 0 8px; font-size: 16px; }
          p { margin: 0 0 12px; color: var(--vscode-descriptionForeground); }
          pre { white-space: pre-wrap; overflow-x: auto; padding: 12px; border-radius: 8px; background: var(--vscode-textCodeBlock-background); }
        </style>
      </head>
      <body>${content}</body>
      </html>`;
    }
}
exports.DiffPreviewPanel = DiffPreviewPanel;
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
//# sourceMappingURL=diffPreviewPanel.js.map