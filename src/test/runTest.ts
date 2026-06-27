import * as path from 'path';
import * as fs from 'fs';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../..');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const workspacePath = path.resolve(extensionDevelopmentPath, 'test-fixtures', 'workspace');
    const localCodeExecutable = path.resolve(process.env.LOCALAPPDATA ?? '', 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd');
    const testHostRoot = path.resolve(extensionDevelopmentPath, '.vscode-test');
    const userDataDir = path.resolve(testHostRoot, 'user-data');
    const extensionsDir = path.resolve(testHostRoot, 'extensions');

    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(extensionsDir, { recursive: true });

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      vscodeExecutablePath: fs.existsSync(localCodeExecutable) ? localCodeExecutable : undefined,
      launchArgs: [
        workspacePath,
        '--disable-extensions',
        '--user-data-dir',
        userDataDir,
        '--extensions-dir',
        extensionsDir,
        '--no-sandbox'
      ]
    });
  } catch (error) {
    console.error('Failed to run extension tests.', error);
    process.exit(1);
  }
}

void main();
