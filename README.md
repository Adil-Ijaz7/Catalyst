# Aiora Code Agent

Aiora Code Agent is a production-ready MVP VS Code extension that brings an AI-powered coding agent into your workspace. It combines a modular TypeScript backend, multi-provider model routing (OpenRouter-first), a responsive webview chat experience, staged file mutations, terminal tooling, diagnostics access, and diff approval before applying changes.

## Features

- Chat with your codebase through a sidebar webview
- Discover relevant files automatically via keyword scoring
- Read, search, create, modify, move, copy, rename, and delete files with approval gates
- Run validated terminal commands (npm, git, build, test, and more)
- Inspect VS Code diagnostics for the workspace or a specific file
- Generate code from natural language
- Refactor or fix bugs across multiple files
- View plans, tool activity, and diffs in one UI
- Stream assistant responses while the agent works
- Approve, discard, or diff individual staged file changes
- Switch models and providers through VS Code settings
- Granular permission system with allow / ask / deny modes per capability
- Rich diff preview panel with before/after side-by-side comparison

## Architecture

### Backend

- `src/extension.ts`: activation, dependency wiring, command registration, and public API export
- `src/agent/`:
  - `agentOrchestrator.ts`: manages the agent loop, streaming, pending changes, and apply/discard flows
  - `planner.ts`: builds dynamic execution plans based on prompt intent
  - `contextManager.ts`: discovers and scores relevant files from the workspace
  - `conversationMemory.ts`: retains chat history across turns
  - `toolRegistry.ts`: registers tools and converts them to OpenRouter function definitions
  - `toolExecutor.ts`: runs tools with permission checks and activity tracking
- `src/services/`:
  - `openRouterService.ts`: multi-provider chat completions with streaming and tool-calling support
  - `permissionService.ts`: granular permission rules with allow / ask / deny modes
- `src/tools/`:
  - `base.ts`: abstract base class for all tools
  - `fileTools.ts`: 13 file and directory tools (read, write, edit, create, delete, rename, move, copy, mkdir, rmdir, search, glob, list)
  - `terminalTool.ts`: terminal, install, test, build, and log tools
  - `gitTools.ts`: git status, diff, commit, branch, push, and pull tools
  - `diagnosticsTool.ts`: VS Code diagnostics reader
  - `index.ts`: `createDefaultTools()` factory registering all 25 built-in tools
- `src/utils/`:
  - `pathUtils.ts`: workspace-relative path resolution and safety
  - `commandValidator.ts`: terminal command validation
  - `diffUtils.ts`: unified diff generation for staged changes
  - `verification.ts`: workspace change verification for staged mutations
- `src/ui/`:
  - `chatViewProvider.ts`: sidebar webview provider with full state management
  - `diffPreviewPanel.ts`: standalone diff preview webview panel
  - `pendingChangeDiffProvider.ts`: virtual document content provider for side-by-side diff rendering

### Frontend

- `media/main.css`: responsive interface styling
- `media/main.js`: webview state rendering and command dispatch
- `media/aiora-icon.svg`: sidebar activity bar icon

## Folder Structure

```text
.
|-- media/
|   |-- aiora-icon.svg
|   |-- catalyst-icon.png
|   |-- catalyst-sidebar-icon.svg
|   |-- main.css
|   `-- main.js
|-- src/
|   |-- agent/
|   |   |-- agentOrchestrator.ts
|   |   |-- contextManager.ts
|   |   |-- conversationMemory.ts
|   |   |-- planner.ts
|   |   |-- toolExecutor.ts
|   |   `-- toolRegistry.ts
|   |-- services/
|   |   |-- openRouterService.ts
|   |   `-- permissionService.ts
|   |-- tools/
|   |   |-- base.ts
|   |   |-- diagnosticsTool.ts
|   |   |-- fileTools.ts
|   |   |-- gitTools.ts
|   |   |-- index.ts
|   |   `-- terminalTool.ts
|   |-- ui/
|   |   |-- chatViewProvider.ts
|   |   |-- diffPreviewPanel.ts
|   |   `-- pendingChangeDiffProvider.ts
|   |-- utils/
|   |   |-- commandValidator.ts
|   |   |-- diffUtils.ts
|   |   |-- pathUtils.ts
|   |   `-- verification.ts
|   |-- test/
|   |   |-- runTest.ts
|   |   `-- suite/
|   |       |-- extension.test.ts
|   |       `-- index.ts
|   |-- extension.ts
|   `-- types.ts
|-- test-fixtures/workspace/
|-- package.json
|-- tsconfig.json
|-- LICENSE
`-- README.md
```

## Configuration

Configure the extension from VS Code settings (`aioraCodeAgent.*`):

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `aioraCodeAgent.model` | string | `openrouter/free` | Model used by the agent. |
| `aioraCodeAgent.provider` | string | `openrouter` | Model provider abstraction. |
| `aioraCodeAgent.baseUrl` | string | `https://openrouter.ai/api/v1` | Base URL for the API. |
| `aioraCodeAgent.maxIterations` | number | `6` | Maximum tool-calling iterations per run (1-12). |
| `aioraCodeAgent.maxContextFiles` | number | `6` | Maximum files during context discovery (1-20). |
| `aioraCodeAgent.allowTerminalCommands` | boolean | `true` | Allow the agent to propose and run terminal commands. |

### Supported Providers

| Provider | Status | Example Models |
|----------|--------|----------------|
| `openrouter` | Fully validated | `openrouter/free`, `openrouter/owl-alpha`, `nex-agi/nex-n2-pro:free`, `poolside/laguna-m.1:free`, `openai/gpt-oss-120b:free`, `anthropic/claude-3.5-sonnet`, `openai/gpt-5`, `google/gemini-2.5-pro`, `deepseek/deepseek-chat` |
| `openai` | Compatible | `gpt-5`, `gpt-4.1`, `gpt-4o` |
| `anthropic` | Compatible | `claude-sonnet-4`, `claude-3-5-sonnet-latest` |
| `google` | Compatible | `gemini-2.5-pro`, `gemini-2.5-flash` |
| `ollama` | Compatible | `llama3.1`, `qwen2.5-coder`, `deepseek-r1` |
| `groq` | Compatible | `llama-3.3-70b-versatile`, `qwen-qwq-32b` |
| `deepseek` | Compatible | `deepseek-chat`, `deepseek-reasoner` |
| `qwen` | Compatible | `qwen2.5-coder-32b-instruct`, `qwq-32b` |
| `mistral` | Compatible | `mistral-large-latest`, `codestral-latest` |
| `xai` | Compatible | `grok-3-mini`, `grok-3` |
| `agentrouter` | Compatible | `agentrouter/default` |

Store your API key with the command:

`Aiora Code Agent: Configure OpenRouter API Key`

The key is stored securely in the VS Code secret store.

## Commands

| Command | Title |
|---------|-------|
| `aioraCodeAgent.openChat` | Aiora Code Agent: Open Chat |
| `aioraCodeAgent.configureApiKey` | Aiora Code Agent: Configure OpenRouter API Key |
| `aioraCodeAgent.openDiffPreview` | Aiora Code Agent: Open Diff Preview |
| `aioraCodeAgent.approvePendingChanges` | Aiora Code Agent: Approve Pending Changes |
| `aioraCodeAgent.rejectPendingChanges` | Aiora Code Agent: Reject Pending Changes |
| `aioraCodeAgent.resetConversation` | Aiora Code Agent: Reset Conversation |

## Build Instructions

```bash
npm install
npm run build
```

Press `F5` in VS Code to launch the Extension Development Host.

For development with auto-rebuild:

```bash
npm run watch
```

## Test Instructions

Run the VS Code integration suite:

```bash
npm test
```

The integration tests spin up a local mock server and launch a VS Code test host against `test-fixtures/workspace`. They validate:

- Extension activation and API export
- Streamed assistant text delivery
- Staged file creation and apply
- Subset apply and discard flows
- Rich diff preview opening with the `aiora-diff` URI scheme

## Packaging Instructions

Install the VS Code extension packaging tool if you do not already have it:

```bash
npm install -g @vscode/vsce
```

Create a package:

```bash
vsce package
```

This produces a `.vsix` file that can be installed locally in VS Code.

## Publishing Instructions

1. Create a publisher in the Visual Studio Marketplace.
2. Update the `publisher` field in `package.json`.
3. Create a Personal Access Token for the Marketplace.
4. Log in with `vsce login <publisher>`.
5. Publish with `vsce publish`.

## Public API

The extension exports a programmatic API via `extension.activate()`:

```typescript
interface AioraExtensionApi {
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
```

This API is used by the integration test suite and can be consumed by other extensions.

## Permission Model

Each tool declares its required permissions. The permission system supports three modes:

- **allow**: The action proceeds without prompting.
- **ask**: The user is prompted with Allow Once, Always Allow, or Deny.
- **deny**: The action is blocked automatically.

Configurable permissions include:

- `read_files`, `modify_files`, `create_files`, `rename_files`, `delete_files`
- `create_directories`, `delete_directories`
- `run_terminal`, `install_dependencies`, `run_tests`, `build_project`
- `git_commit`, `git_branch`, `git_push`, `git_pull`
- `modify_package_json`
- `dangerous_delete` (default: deny)
- `access_ssh` (default: deny)
- `access_passwords` (default: deny)
- `network_requests`, `access_browser`, `read_environment`

Permission modes are persisted per-workspace in VS Code state.

## Built-in Tools (25)

### File & Directory Tools
| Tool | Description |
|------|-------------|
| `read_file` | Read a UTF-8 text file |
| `write_file` | Overwrite a file (staged) |
| `edit_file` | Replace text within a file (staged) |
| `create_file` | Create a new file (staged) |
| `delete_file` | Delete a file (staged) |
| `rename_file` | Rename a file (staged) |
| `move_file` | Move a file (staged) |
| `copy_file` | Copy a file (staged) |
| `create_directory` | Create a directory (staged) |
| `delete_directory` | Delete a directory recursively (staged, high risk) |
| `search_files` | Search files for a literal text query |
| `glob_files` | List files matching a glob pattern |
| `list_directory` | List directory contents |

### Terminal & Build Tools
| Tool | Description |
|------|-------------|
| `run_terminal` | Run a validated terminal command |
| `install_dependencies` | Install npm/pnpm/yarn/bun dependencies |
| `run_tests` | Run the project test command |
| `build_project` | Run the project build command |
| `view_logs` | Read logs or command output |

### Git Tools
| Tool | Description |
|------|-------------|
| `git_status` | Show git status |
| `git_diff` | Show git diff |
| `git_commit` | Create a git commit |
| `git_branch` | Create or switch a branch |
| `git_push` | Push to remote |
| `git_pull` | Pull from remote |

### Diagnostics
| Tool | Description |
|------|-------------|
| `get_diagnostics` | Read VS Code diagnostics for the workspace or a file |

## MVP Workflow

1. User sends a natural-language request from the sidebar chat.
2. Planner builds a dynamic execution plan based on prompt intent.
3. Context manager discovers and scores relevant files from the workspace.
4. OpenRouter (or compatible provider) receives the prompt plus registered tool definitions.
5. Tool executor runs safe tools and stages mutating changes as pending.
6. Webview streams assistant output, shows tool activity, and surfaces staged diffs.
7. User approves or rejects all or part of the staged changes.
8. Approved changes are applied to the workspace.

## Security Model

- Workspace paths are restricted to the active workspace root
- File mutations are staged before apply; nothing writes without approval
- Overwrites and deletes require explicit confirmation via permission system
- Recursive directory deletion is classified as high risk
- Terminal commands pass through a validation layer
- Diagnostics and file access stay scoped to the workspace
- Sensitive permissions (SSH, passwords, dangerous deletes) default to deny
- API keys are stored in the VS Code secret store, never in plaintext config

## Notes

- This MVP is intentionally modular so you can add embeddings, indexing, richer diff UIs, and model-specific optimizations without rewriting the core architecture.
- The OpenRouter service uses OpenAI-compatible chat completions with tool-calling support and SSE streaming.
- Multi-provider support is architected in; OpenRouter is the fully validated runtime today.
- Licensed under MIT. See `LICENSE` for details.
