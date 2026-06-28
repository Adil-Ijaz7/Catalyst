# Project Brain Context: Aiora Code Agent

## Overview
- **Name:** Aiora Code Agent
- **Description:** A production-ready MVP AI coding assistant for VS Code powered by OpenRouter.
- **Primary Language:** TypeScript
- **Framework/Environment:** Node.js, VS Code Extension API

## Architecture & Directory Structure
The source code is primarily located in `src/`.

- **`src/extension.ts`**: The main activation entry point and dependency wiring.
- **`src/agent/`**: Contains the core agent logic:
  - `agentOrchestrator.ts`: Manages the overall agent workflow.
  - `planner.ts`: Builds execution plans.
  - `contextManager.ts`: Discovers and summarizes files.
  - `conversationMemory.ts`: Manages chat history.
  - `toolRegistry.ts` & `toolExecutor.ts`: Registers and runs tools safely.
- **`src/services/`**:
  - `openRouterService.ts`: Integration with OpenRouter for LLM communication.
- **`src/tools/`**: Extensible tools for the agent:
  - `fileTools.ts`: File creation, reading, and mutation tools with approval gates.
  - `terminalTool.ts`: Runs validated terminal commands.
  - `diagnosticsTool.ts`: Access to VS Code diagnostics/linting errors.
- **`src/ui/`**: User interface components:
  - `chatViewProvider.ts`: Sidebar webview provider for chat interactions.
  - `diffPreviewPanel.ts`: Renders diffs before user approval.
- **`src/utils/`**:
  - Utilities for diffing (`diffUtils.ts`), path safety (`pathUtils.ts`), and command validation (`commandValidator.ts`).
- **`media/`**: Contains frontend styling and logic (`main.css`, `main.js`) for the webview.

## Key Concepts & Workflows
- **Tooling & Mutations**: File mutations are staged before they are applied. Users must approve or reject changes through the UI.
- **Security**: Workspace paths are restricted to the active root. Overwrites/deletes require confirmation, and terminal commands are validated.
- **Configuration**: Settings like Model provider, Base URL, API key, Max Iterations, and Context size are configured via standard VS Code settings (`aioraCodeAgent.*`).

## Scripts & Development
- **Build**: `npm run build` or `npm run watch` (uses `tsc`)
- **Test**: `npm test` (Mocha tests for VS Code extensions)
- **Package**: `npm run package` (uses `vsce`)
