(function () {
  const vscode = acquireVsCodeApi();
  let activeTab = 'chat';

  const state = {
    model: '',
    provider: 'openrouter',
    baseUrl: '',
    apiKeyConfigured: false,
    providerOptions: [],
    modelOptions: [],
    connectionStatus: 'idle',
    connectionMessage: '',
    plan: [],
    messages: [],
    toolActivity: [],
    pendingChanges: [],
    permissions: [],
    busy: false,
    streamingText: '',
    error: undefined,
    maxIterations: 6,
    maxContextFiles: 6,
    allowTerminalCommands: true
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getFileIcon(filename) {
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'TS';
    if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'JS';
    if (filename.endsWith('.css')) return '#';
    if (filename.endsWith('.json')) return '{}';
    return '📄';
  }

  function renderMessages() {
    let html = '';
    
    if (!state.messages.length && !state.streamingText) {
      return '<div class="empty-state">Ask anything or use \'/\' for commands</div>';
    }

    state.messages.forEach(msg => {
      if (msg.role === 'user') {
        html += `<div class="message user">${escapeHtml(msg.content)}</div>`;
      } else {
        html += `
          <div class="message assistant">
            <div class="assistant-header">
              <div class="icon">✨</div>
              CodeAgent
            </div>
            <div class="thought-block">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 6h8v2H4zm0 5h5v-2H4zm-2.5-9A1.5 1.5 0 0 1 3 0h10a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 13 13h-3l-4 3v-3H3A1.5 1.5 0 0 1 1.5 11.5v-10z"/></svg>
              Thought for a moment
            </div>
            <div style="font-size: 13px; line-height: 1.5; color: var(--text);">${escapeHtml(msg.content).replace(/\n/g, '<br/>')}</div>
          </div>
        `;
      }
    });

    if (state.streamingText) {
      html += `
        <div class="message assistant">
          <div class="assistant-header">
            <div class="icon">✨</div>
            CodeAgent
          </div>
          <div style="font-size: 13px; line-height: 1.5; color: var(--text);">${escapeHtml(state.streamingText).replace(/\n/g, '<br/>')}</div>
        </div>
      `;
    }

    return html;
  }

  function renderPendingChanges() {
    if (!state.pendingChanges || !state.pendingChanges.length) return '';

    const filesHtml = state.pendingChanges.map(change => `
      <div class="file-row">
        <div class="file-name">
          <span style="color: #3b82f6; font-weight: bold; font-size: 10px;">${getFileIcon(change.path)}</span>
          ${escapeHtml(change.path)}
        </div>
        <div class="file-stats">
          <span class="stat-add">+1</span>
          <span class="stat-sub">-1</span>
        </div>
      </div>
    `).join('');

    return `
      <div class="action-card">
        <header>
          <span>Changes to be made</span>
          <span style="color: var(--muted); font-weight: normal; font-size: 12px;">${state.pendingChanges.length} files</span>
        </header>
        <div class="card-body">
          <div class="file-list">
            ${filesHtml}
          </div>
          <div class="actions">
            <button class="primary" data-action="openDiffPreview">Preview Changes</button>
            <button class="secondary" data-action="approveChanges">Apply All</button>
            <button class="ghost" data-action="rejectChanges">Discard</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderPermissions() {
    const askCount = state.permissions.filter(p => p.mode === 'ask').length;
    if (askCount === 0) return '';
    return `
      <div class="action-card warning">
        <header>
          <div style="display: flex; align-items: center; gap: 6px;">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5l7 12H1l7-12zm-.5 9v1.5h1V10.5h-1zm0-4v3h1v-3h-1z"/></svg>
            Workspace Permissions
          </div>
        </header>
        <div class="card-body">
          <div style="font-size: 12px; line-height: 1.4;">
            Aiora Code Agent is configured to ask permission for workspace access or modifications. You can review and adjust these rules in settings.
          </div>
          <div class="actions" style="margin-top: 4px;">
            <button class="primary" data-tab-target="settings">Open Settings</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderSettings() {
    const providersHtml = state.providerOptions.map(p => `
      <option value="${p.id}" ${p.id === state.provider ? 'selected' : ''}>${escapeHtml(p.label)} ${p.note ? `(${p.note})` : ''}</option>
    `).join('');

    const modelsHtml = state.modelOptions.map(m => `
      <option value="${m}" ${m === state.model ? 'selected' : ''}>${escapeHtml(m)}</option>
    `).join('');

    const connectionClass = state.connectionStatus === 'success' ? 'success' : (state.connectionStatus === 'error' ? 'error' : (state.connectionStatus === 'testing' ? 'testing' : ''));
    const connectionMsg = state.connectionMessage ? escapeHtml(state.connectionMessage) : '';

    const permissionsHtml = state.permissions.map(rule => `
      <div class="permission-item">
        <div class="permission-header">
          <span class="permission-name">${escapeHtml(rule.label)}</span>
          <select class="permission-select" data-permission-id="${rule.id}">
            <option value="allow" ${rule.mode === 'allow' ? 'selected' : ''}>Allow</option>
            <option value="ask" ${rule.mode === 'ask' ? 'selected' : ''}>Ask</option>
            <option value="deny" ${rule.mode === 'deny' ? 'selected' : ''}>Deny</option>
          </select>
        </div>
        <div class="settings-description">${escapeHtml(rule.description)}</div>
      </div>
    `).join('');

    return `
      <div class="settings-container">
        <div class="settings-section">
          <div class="settings-title">Model Provider</div>
          <div class="settings-row">
            <label class="settings-label">API Provider</label>
            <select id="providerSelect" class="settings-select">
              ${providersHtml}
            </select>
          </div>
          <div class="settings-row">
            <label class="settings-label">Model</label>
            <select id="modelSelectSettings" class="settings-select">
              ${modelsHtml}
            </select>
          </div>
          <div class="settings-row">
            <label class="settings-label">Base URL</label>
            <div class="settings-input-group">
              <input type="text" id="baseUrlInput" value="${escapeHtml(state.baseUrl)}" />
              <button class="secondary" id="saveBaseUrlBtn">Save</button>
            </div>
          </div>
          <div class="settings-row">
            <label class="settings-label">API Key</label>
            <div class="settings-input-group">
              <input type="password" id="apiKeyInput" placeholder="${state.apiKeyConfigured ? '••••••••••••••••••••••••' : 'Enter API Key'}" />
              <button class="primary" id="saveApiKeyBtn">Save Key</button>
            </div>
          </div>
          <div class="settings-row">
            <button class="secondary" id="testConnBtn" style="margin-top: 4px; align-self: flex-start;">Test Connection</button>
            ${connectionClass ? `<div class="connection-status-box ${connectionClass}">${connectionMsg}</div>` : ''}
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-title">Agent Settings</div>
          <div class="settings-row-inline">
            <div>
              <span class="settings-label">Max Iterations</span>
              <div class="settings-description">Maximum tool calls per run.</div>
            </div>
            <input type="number" id="maxIterationsInput" style="width: 60px;" min="1" max="20" value="${state.maxIterations ?? 6}" />
          </div>
          <div class="settings-row-inline">
            <div>
              <span class="settings-label">Max Context Files</span>
              <div class="settings-description">Maximum files analyzed during workspace scans.</div>
            </div>
            <input type="number" id="maxContextFilesInput" style="width: 60px;" min="1" max="25" value="${state.maxContextFiles ?? 6}" />
          </div>
          <div class="settings-row-inline">
            <div>
              <span class="settings-label">Allow Terminal Commands</span>
              <div class="settings-description">Enables executing proposed command steps.</div>
            </div>
            <label class="switch">
              <input type="checkbox" id="allowTerminalCommandsInput" ${state.allowTerminalCommands ? 'checked' : ''} />
              <span class="slider"></span>
            </label>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-title">Workspace Permissions</div>
          <div class="settings-description" style="margin-bottom: 8px; line-height: 1.4;">
            Control what actions the agent can perform. For maximum security, keep file access permissions set to <strong>Ask</strong>.
          </div>
          <div class="permissions-list">
            ${permissionsHtml}
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    const app = document.getElementById('app');

    const tabsHtml = `
      <div class="tabs">
        <div class="tab ${activeTab === 'chat' ? 'active' : ''}" data-tab="chat">CHAT</div>
        <div class="tab ${activeTab === 'settings' ? 'active' : ''}" data-tab="settings">SETTINGS</div>
      </div>
    `;

    if (activeTab === 'chat') {
      app.innerHTML = `
        ${tabsHtml}
        <div class="chat-container" id="chatContainer">
          ${renderMessages()}
          ${renderPendingChanges()}
          ${renderPermissions()}
          ${state.error ? `<div class="message user" style="border-color: var(--danger); color: var(--danger);">${escapeHtml(state.error)}</div>` : ''}
        </div>

        <div class="composer-container">
          <div class="composer-pills">
            <div class="pill" data-tab-target="settings">⚙️ Settings</div>
            <div class="pill" data-action="resetConversation">🔄 Reset Chat</div>
          </div>
          
          <div class="composer-input-area">
            <textarea id="prompt" placeholder="Ask anything or use '/' for commands" rows="1"></textarea>
            
            <div class="composer-bottom">
              <div class="composer-tools">
                <select id="modelSelect">
                  ${state.modelOptions.map((model) => `
                    <option value="${escapeHtml(model)}" ${model === state.model ? 'selected' : ''}>${escapeHtml(model)}</option>
                  `).join('')}
                </select>
                <span>Mention</span>
                <span>Image</span>
                <span>Auto</span>
              </div>
              <button class="send-btn" data-action="submitPrompt" ${state.busy ? 'disabled' : ''}>
                <svg viewBox="0 0 16 16"><path d="M1 14.5l14-6.5-14-6.5 2.5 6.5L1 14.5z"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;

      // Auto-resize textarea
      const textarea = document.getElementById('prompt');
      if (textarea) {
        textarea.addEventListener('input', function() {
          this.style.height = 'auto';
          this.style.height = (this.scrollHeight) + 'px';
        });
        textarea.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.querySelector('.send-btn').click();
          }
        });
      }

      // Bind prompt submittal
      app.querySelectorAll('[data-action]').forEach((button) => {
        button.addEventListener('click', () => {
          const action = button.getAttribute('data-action');
          if (action === 'submitPrompt') {
            const val = document.getElementById('prompt').value;
            if(val) {
              vscode.postMessage({
                type: 'submitPrompt',
                payload: val
              });
            }
            return;
          }

          const typeMap = {
            resetConversation: 'resetConversation',
            approveChanges: 'approveChanges',
            rejectChanges: 'rejectChanges',
            openDiffPreview: 'openDiffPreview'
          };
          
          if (typeMap[action]) {
            vscode.postMessage({ type: typeMap[action] });
          }
        });
      });

      const modelSelect = document.getElementById('modelSelect');
      if (modelSelect) {
        modelSelect.addEventListener('change', (event) => {
          vscode.postMessage({ type: 'setModel', payload: event.target.value });
        });
      }

      // Scroll to bottom
      const chatContainer = document.getElementById('chatContainer');
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    } else if (activeTab === 'settings') {
      app.innerHTML = `
        ${tabsHtml}
        ${renderSettings()}
      `;

      // Bind settings inputs
      const providerSelect = document.getElementById('providerSelect');
      if (providerSelect) {
        providerSelect.addEventListener('change', (e) => {
          vscode.postMessage({ type: 'setProvider', payload: e.target.value });
        });
      }

      const modelSelectSettings = document.getElementById('modelSelectSettings');
      if (modelSelectSettings) {
        modelSelectSettings.addEventListener('change', (e) => {
          vscode.postMessage({ type: 'setModel', payload: e.target.value });
        });
      }

      const saveBaseUrlBtn = document.getElementById('saveBaseUrlBtn');
      if (saveBaseUrlBtn) {
        saveBaseUrlBtn.addEventListener('click', () => {
          const val = document.getElementById('baseUrlInput').value;
          vscode.postMessage({ type: 'saveBaseUrl', payload: val });
        });
      }

      const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
      if (saveApiKeyBtn) {
        saveApiKeyBtn.addEventListener('click', () => {
          const val = document.getElementById('apiKeyInput').value;
          vscode.postMessage({ type: 'setApiKey', payload: val });
        });
      }

      const testConnBtn = document.getElementById('testConnBtn');
      if (testConnBtn) {
        testConnBtn.addEventListener('click', () => {
          vscode.postMessage({ type: 'testConnection' });
        });
      }

      const maxIterationsInput = document.getElementById('maxIterationsInput');
      if (maxIterationsInput) {
        maxIterationsInput.addEventListener('change', (e) => {
          vscode.postMessage({ type: 'setMaxIterations', payload: parseInt(e.target.value, 10) });
        });
      }

      const maxContextFilesInput = document.getElementById('maxContextFilesInput');
      if (maxContextFilesInput) {
        maxContextFilesInput.addEventListener('change', (e) => {
          vscode.postMessage({ type: 'setMaxContextFiles', payload: parseInt(e.target.value, 10) });
        });
      }

      const allowTerminalCommandsInput = document.getElementById('allowTerminalCommandsInput');
      if (allowTerminalCommandsInput) {
        allowTerminalCommandsInput.addEventListener('change', (e) => {
          vscode.postMessage({ type: 'setAllowTerminalCommands', payload: e.target.checked });
        });
      }

      app.querySelectorAll('.permission-select').forEach(select => {
        select.addEventListener('change', (e) => {
          const permissionId = select.getAttribute('data-permission-id');
          vscode.postMessage({
            type: 'setPermissionMode',
            payload: {
              permissionId,
              mode: e.target.value
            }
          });
        });
      });
    }

    // Bind common tab controls
    app.querySelectorAll('[data-tab]').forEach((tabEl) => {
      tabEl.addEventListener('click', () => {
        activeTab = tabEl.getAttribute('data-tab');
        render();
      });
    });

    app.querySelectorAll('[data-tab-target]').forEach((el) => {
      el.addEventListener('click', () => {
        activeTab = el.getAttribute('data-tab-target');
        render();
      });
    });
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'state') {
      Object.assign(state, event.data.payload);
      render();
    }
  });

  render();
  vscode.postMessage({ type: 'ready' });
})();
