import { GetDiagnosticsTool } from './diagnosticsTool';
import {
  CopyFileTool,
  CreateDirectoryTool,
  CreateFileTool,
  DeleteFileTool,
  DeleteDirectoryTool,
  EditFileTool,
  GlobFilesTool,
  ListDirectoryTool,
  MoveFileTool,
  ReadFileTool,
  RenameFileTool,
  SearchFilesTool,
  WriteFileTool
} from './fileTools';
import { GitBranchTool, GitCommitTool, GitDiffTool, GitPullTool, GitPushTool, GitStatusTool } from './gitTools';
import { BuildProjectTool, InstallDependenciesTool, RunTerminalTool, RunTestsTool, ViewLogsTool } from './terminalTool';
import { ToolDefinition } from '../types';

export function createDefaultTools(): ToolDefinition[] {
  return [
    new ReadFileTool(),
    new WriteFileTool(),
    new EditFileTool(),
    new CreateFileTool(),
    new DeleteFileTool(),
    new RenameFileTool(),
    new MoveFileTool(),
    new CopyFileTool(),
    new CreateDirectoryTool(),
    new DeleteDirectoryTool(),
    new SearchFilesTool(),
    new GlobFilesTool(),
    new ListDirectoryTool(),
    new RunTerminalTool(),
    new InstallDependenciesTool(),
    new RunTestsTool(),
    new BuildProjectTool(),
    new ViewLogsTool(),
    new GitStatusTool(),
    new GitDiffTool(),
    new GitCommitTool(),
    new GitBranchTool(),
    new GitPushTool(),
    new GitPullTool(),
    new GetDiagnosticsTool()
  ];
}
