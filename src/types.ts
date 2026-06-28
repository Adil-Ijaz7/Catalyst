import * as vscode from 'vscode';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolInvocation {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type PermissionMode = 'allow' | 'ask' | 'deny';

export type PermissionId =
  | 'read_files'
  | 'modify_files'
  | 'create_files'
  | 'rename_files'
  | 'delete_files'
  | 'create_directories'
  | 'delete_directories'
  | 'run_terminal'
  | 'install_dependencies'
  | 'run_tests'
  | 'build_project'
  | 'git_commit'
  | 'git_branch'
  | 'git_push'
  | 'git_pull'
  | 'network_requests'
  | 'access_browser'
  | 'read_environment'
  | 'modify_package_json'
  | 'dangerous_delete'
  | 'access_ssh'
  | 'access_passwords';

export interface PermissionRule {
  id: PermissionId;
  label: string;
  description: string;
  mode: PermissionMode;
  source: 'default' | 'workspace';
}

export interface PermissionRequest {
  id: PermissionId;
  reason: string;
}

export interface ToolResult {
  success: boolean;
  content: string;
  data?: unknown;
  workspaceChange?: PendingWorkspaceChange;
}

export interface ToolActivityEntry {
  timestamp: string;
  tool: string;
  status: 'started' | 'completed' | 'failed' | 'blocked';
  summary: string;
}

export interface PlanStep {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export type PendingWorkspaceChangeType = 'create' | 'write' | 'delete' | 'rename' | 'copy' | 'mkdir' | 'rmdir';

export interface PendingWorkspaceChange {
  id: string;
  type: PendingWorkspaceChangeType;
  path: string;
  previousPath?: string;
  previousContent?: string;
  nextContent?: string;
  diff: string;
  description: string;
}

export interface ToolExecutionContext {
  workspaceRoot: vscode.Uri;
  previewOnly: boolean;
  outputChannel: vscode.OutputChannel;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly isMutating: boolean;
  readonly permissions: PermissionRequest[];
  getAdditionalPermissions?(args: Record<string, unknown>): PermissionRequest[];
  execute(args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult>;
}

export interface ContextFile {
  path: string;
  excerpt: string;
  score: number;
}

export interface AgentContextSnapshot {
  workspaceRoot: string;
  relevantFiles: ContextFile[];
}

export interface AgentRunResult {
  response: string;
  plan: PlanStep[];
  toolActivity: ToolActivityEntry[];
  pendingChanges: PendingWorkspaceChange[];
  context: AgentContextSnapshot;
}

export interface AgentRunProgress {
  streamingText?: string;
  toolActivity?: ToolActivityEntry[];
  pendingChanges?: PendingWorkspaceChange[];
  plan?: PlanStep[];
}

export interface AgentRunOptions {
  onProgress?: (progress: AgentRunProgress) => void;
}

export type ModelProvider =
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'groq'
  | 'deepseek'
  | 'qwen'
  | 'mistral'
  | 'xai'
  | 'agentrouter';

export interface OpenRouterSettings {
  provider: ModelProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  maxIterations: number;
  maxContextFiles: number;
  allowTerminalCommands: boolean;
}

export interface ProviderOption {
  id: ModelProvider;
  label: string;
  note?: string;
}

export interface WebviewState {
  model: string;
  provider: ModelProvider;
  baseUrl: string;
  apiKeyConfigured: boolean;
  providerOptions: ProviderOption[];
  modelOptions: string[];
  connectionStatus: 'idle' | 'testing' | 'success' | 'error';
  connectionMessage?: string;
  plan: PlanStep[];
  messages: ChatMessage[];
  toolActivity: ToolActivityEntry[];
  pendingChanges: PendingWorkspaceChange[];
  permissions: PermissionRule[];
  busy: boolean;
  streamingText?: string;
  lastResponse?: string;
  error?: string;
  maxIterations?: number;
  maxContextFiles?: number;
  allowTerminalCommands?: boolean;
}

export interface OpenRouterToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface OpenRouterResponseMessage {
  role: 'assistant';
  content?: string | null;
  tool_calls?: OpenRouterToolCall[];
}

export interface AioraExtensionApi {
  runPrompt(prompt: string, options?: AgentRunOptions): Promise<AgentRunResult>;
  getPendingChanges(): PendingWorkspaceChange[];
  applyPendingChanges(changeIds?: string[]): Promise<void>;
  discardPendingChanges(changeIds?: string[]): void;
  openPendingChangeDiff(changeId: string): Promise<void>;
  resetConversation(): void;
  storeApiKey(apiKey: string): Promise<void>;
  getPermissions(): PermissionRule[];
  setPermissionMode(permissionId: PermissionId, mode: PermissionMode): Promise<void>;
}
