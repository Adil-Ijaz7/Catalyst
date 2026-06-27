import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as http from 'http';
import * as path from 'path';
import * as vscode from 'vscode';
import { AddressInfo } from 'net';
import { AioraExtensionApi } from '../../types';

const EXTENSION_ID = 'aiora.aiora-code-agent';
const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';

suite('Aiora Code Agent Integration', () => {
  let server: http.Server;
  let baseUrl = '';
  let api: AioraExtensionApi;

  suiteSetup(async () => {
    server = http.createServer(async (request, response) => {
      if (request.method !== 'POST' || request.url !== '/api/v1/chat/completions') {
        response.writeHead(404);
        response.end();
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
        stream?: boolean;
        messages: Array<{ role: string; content?: string; name?: string }>;
      };

      const userPrompt = [...body.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
      const toolMessage = [...body.messages].reverse().find((message) => message.role === 'tool');

      if (body.stream) {
        response.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        });

        if (userPrompt.includes('stream hello')) {
          writeSse(response, { choices: [{ delta: { content: 'Hello ' } }] });
          writeSse(response, { choices: [{ delta: { content: 'from stream' } }] });
          writeSse(response, '[DONE]');
          response.end();
          return;
        }

        if (userPrompt.includes('stage create')) {
          if (!toolMessage) {
            writeSse(response, {
              choices: [{
                delta: {
                  tool_calls: [{
                    index: 0,
                    id: 'tool-create-1',
                    function: { name: 'create_file', arguments: '{"path":"generated/alpha.txt",' }
                  }]
                }
              }]
            });
            writeSse(response, {
              choices: [{
                delta: {
                  tool_calls: [{
                    index: 0,
                    function: { arguments: '"content":"alpha from test"}' }
                  }]
                }
              }]
            });
            writeSse(response, '[DONE]');
            response.end();
            return;
          }

          writeSse(response, { choices: [{ delta: { content: 'Staged one change.' } }] });
          writeSse(response, '[DONE]');
          response.end();
          return;
        }

        if (userPrompt.includes('stage two files')) {
          if (!toolMessage) {
            writeSse(response, {
              choices: [{
                delta: {
                  tool_calls: [{
                    index: 0,
                    id: 'tool-create-2a',
                    function: { name: 'create_file', arguments: '{"path":"generated/one.txt","content":"one"}' }
                  }, {
                    index: 1,
                    id: 'tool-create-2b',
                    function: { name: 'create_file', arguments: '{"path":"generated/two.txt","content":"two"}' }
                  }]
                }
              }]
            });
            writeSse(response, '[DONE]');
            response.end();
            return;
          }

          writeSse(response, { choices: [{ delta: { content: 'Staged two changes.' } }] });
          writeSse(response, '[DONE]');
          response.end();
          return;
        }

        writeSse(response, { choices: [{ delta: { content: 'Unhandled test prompt.' } }] });
        writeSse(response, '[DONE]');
        response.end();
        return;
      }

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Non-stream fallback'
          }
        }]
      }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

    await vscode.workspace.getConfiguration('aioraCodeAgent').update('baseUrl', baseUrl, vscode.ConfigurationTarget.Workspace);
    await vscode.workspace.getConfiguration('aioraCodeAgent').update('model', 'openrouter/free', vscode.ConfigurationTarget.Workspace);

    const extension = vscode.extensions.getExtension<AioraExtensionApi>(EXTENSION_ID);
    assert.ok(extension, 'Extension should be installed in the test host.');
    await extension!.activate();
    api = extension!.exports;
    await api.storeApiKey('test-key');
  });

  suiteTeardown(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });

  setup(async () => {
    api.resetConversation();
    api.discardPendingChanges();
    await fs.rm(path.join(workspaceRoot, 'generated'), { recursive: true, force: true });
  });

  test('streams assistant text progressively', async () => {
    const partials: string[] = [];
    const result = await api.runPrompt('stream hello', {
      onProgress: (progress) => {
        if (progress.streamingText) {
          partials.push(progress.streamingText);
        }
      }
    });

    assert.strictEqual(result.response, 'Hello from stream');
    assert.ok(partials.length >= 2, 'Expected multiple streaming progress updates.');
    assert.strictEqual(partials.at(-1), 'Hello from stream');
  });

  test('stages and applies a created file change', async () => {
    const result = await api.runPrompt('stage create');
    assert.strictEqual(result.pendingChanges.length, 1);

    const targetPath = path.join(workspaceRoot, 'generated', 'alpha.txt');
    await assert.rejects(fs.access(targetPath));

    await api.applyPendingChanges([result.pendingChanges[0].id]);

    const content = await fs.readFile(targetPath, 'utf8');
    assert.strictEqual(content, 'alpha from test');
  });

  test('supports subset apply, discard, and rich diff preview', async () => {
    const result = await api.runPrompt('stage two files');
    assert.strictEqual(result.pendingChanges.length, 2);

    await api.openPendingChangeDiff(result.pendingChanges[0].id);
    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.scheme, 'aiora-diff');

    await api.applyPendingChanges([result.pendingChanges[0].id]);
    const remaining = api.getPendingChanges();
    assert.strictEqual(remaining.length, 1);

    const appliedContent = await fs.readFile(path.join(workspaceRoot, 'generated', 'one.txt'), 'utf8');
    assert.strictEqual(appliedContent, 'one');
    await assert.rejects(fs.access(path.join(workspaceRoot, 'generated', 'two.txt')));

    api.discardPendingChanges([remaining[0].id]);
    assert.strictEqual(api.getPendingChanges().length, 0);
  });
});

function writeSse(response: http.ServerResponse, payload: object | string): void {
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
  response.write(`data: ${serialized}\n\n`);
}
