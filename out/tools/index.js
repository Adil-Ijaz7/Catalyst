"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDefaultTools = createDefaultTools;
const diagnosticsTool_1 = require("./diagnosticsTool");
const fileTools_1 = require("./fileTools");
const gitTools_1 = require("./gitTools");
const terminalTool_1 = require("./terminalTool");
function createDefaultTools() {
    return [
        new fileTools_1.ReadFileTool(),
        new fileTools_1.WriteFileTool(),
        new fileTools_1.EditFileTool(),
        new fileTools_1.CreateFileTool(),
        new fileTools_1.DeleteFileTool(),
        new fileTools_1.RenameFileTool(),
        new fileTools_1.MoveFileTool(),
        new fileTools_1.CopyFileTool(),
        new fileTools_1.CreateDirectoryTool(),
        new fileTools_1.DeleteDirectoryTool(),
        new fileTools_1.SearchFilesTool(),
        new fileTools_1.GlobFilesTool(),
        new fileTools_1.ListDirectoryTool(),
        new terminalTool_1.RunTerminalTool(),
        new terminalTool_1.InstallDependenciesTool(),
        new terminalTool_1.RunTestsTool(),
        new terminalTool_1.BuildProjectTool(),
        new terminalTool_1.ViewLogsTool(),
        new gitTools_1.GitStatusTool(),
        new gitTools_1.GitDiffTool(),
        new gitTools_1.GitCommitTool(),
        new gitTools_1.GitBranchTool(),
        new gitTools_1.GitPushTool(),
        new gitTools_1.GitPullTool(),
        new diagnosticsTool_1.GetDiagnosticsTool()
    ];
}
//# sourceMappingURL=index.js.map