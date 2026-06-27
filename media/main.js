(function () {
  const vscode = acquireVsCodeApi();
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
    error: undefined
  };
  const selectedChangeIds = new Set();
  const knownChangeIds = new Set();

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeSelection() {
    const pendingIds = new Set(state.pendingChanges.map((change) => change.id));
    Array.from(selectedChangeIds).forEach((id) => {
      if (!pendingIds.has(id)) {
        selectedChangeIds.delete(id);
      }
    });

    state.pendingChanges.forEach((change) => {
      if (!knownChangeIds.has(change.id)) {
        knownChangeIds.add(change.id);
        selectedChangeIds.add(change.id);
      }
    });
  }

  function renderPermissions() {
    if (!state.permissions.length) {
      return '<div class="empty">Permission rules will appear here.</div>';
    }

    return state.permissions.map((rule) => `
      <div class="permission-row">
        <div>
          <strong>${escapeHtml(rule.label)}</strong>
          <div class="subtle">${escapeHtml(rule.description)}</div>
        </div>
        <select data-permission-id="${escapeHtml(rule.id)}">
          ${['allow', 'ask', 'deny'].map((mode) => `
            <option value="${mode}" ${rule.mode === mode ? 'selected' : ''}>${mode}</option>
          `).join('')}
        </select>
      </div>
    `).join('');
  }

  function renderMessages() {
    const stored = state.messages.map((message) => `
      <div class="message ${escapeHtml(message.role)}">
        <strong>${escapeHtml(message.role)}</strong>
        <div>${escapeHtml(message.content)}</div>
      </div>
    `).join('');

    const streaming = state.streamingText ? `
      <div class="message assistant streaming">
        <strong>assistant</strong>
        <div>${escapeHtml(state.streamingText)}</div>
      </div>
    ` : '';

    return stored || streaming
      ? `${stored}${streaming}`
      : '<div class="empty">Describe a feature, bug, refactor, or full project and Aiora will plan and act.</div>';
  }

  function renderPlan() {
    return state.plan.length
      ? state.plan.map((step) => `
          <div class="plan-item">
            <div class="status ${escapeHtml(step.status)}">${escapeHtml(step.status)}</div>
            <div>${escapeHtml(step.title)}</div>
          </div>
        `).join('')
      : '<div class="empty">The execution plan appears here once the agent starts.</div>';
  }

  function renderActivity() {
    return state.toolActivity.length
      ? state.toolActivity.map((entry) => `
          <div class="log-item">
            <div class="status ${escapeHtml(entry.status)}">${escapeHtml(entry.status)}</div>
            <strong>${escapeHtml(entry.tool)}</strong>
            <div class="subtle">${escapeHtml(entry.summary)}</div>
          </div>
        `).join('')
      : '<div class="empty">Tool activity will show every file, terminal, git, and diagnostics action.</div>';
  }

  function renderChanges() {
    return state.pendingChanges.length
      ? state.pendingChanges.map((change) => `
          <div class="change-card">
            <label class="check-row">
              <input type="checkbox" data-toggle-change="${escapeHtml(change.id)}" ${selectedChangeIds.has(change.id) ? 'checked' : ''} />
              <span>Include in next apply</span>
            </label>
            <strong>${escapeHtml(change.path)}</strong>
            <div class="subtle">${escapeHtml(change.description)}</div>
            <div class="actions compact">
              <button class="ghost small" data-action="openChangeDiff" data-payload="${escapeHtml(change.id)}">Rich Diff</button>
              <button class="secondary small" data-action="applySingleChange" data-payload="${escapeHtml(change.id)}">Apply</button>
              <button class="ghost small" data-action="discardSingleChange" data-payload="${escapeHtml(change.id)}">Discard</button>
            </div>
            <pre>${escapeHtml(change.diff)}</pre>
          </div>
        `).join('')
      : '<div class="empty">No staged changes yet. Mutations stay here until you approve them.</div>';
  }

  function renderSetupCard() {
    const onboarding = !state.apiKeyConfigured
      ? `<div class="setup-banner">Finish setup to unlock agent mode: choose provider/model, save an API key, then test the connection.</div>`
      : '';

    const note = state.providerOptions.find((option) => option.id === state.provider)?.note;
    const connectionClass = state.connectionStatus === 'success'
      ? 'success'
      : state.connectionStatus === 'error'
        ? 'error'
        : state.connectionStatus === 'testing'
          ? 'testing'
          : 'idle';

    return `
      <section class="panel card full">
        <header>
          <h2>Setup</h2>
          <div class="subtle">Cline-style onboarding and connection controls.</div>
        </header>
        <div class="card-body stack">
          ${onboarding}
          <div class="setup-grid">
            <label class="field">
              <span>Provider</span>
              <select id="providerSelect">
                ${state.providerOptions.map((option) => `
                  <option value="${escapeHtml(option.id)}" ${option.id === state.provider ? 'selected' : ''}>${escapeHtml(option.label)}</option>
                `).join('')}
              </select>
            </label>
            <label class="field">
              <span>Model</span>
              <select id="modelSelect">
                ${state.modelOptions.map((model) => `
                  <option value="${escapeHtml(model)}" ${model === state.model ? 'selected' : ''}>${escapeHtml(model)}</option>
                `).join('')}
              </select>
            </label>
          </div>
          <label class="field">
            <span>Base URL</span>
            <input id="baseUrlInput" type="text" value="${escapeHtml(state.baseUrl)}" />
          </label>
          ${note ? `<div class="subtle">${escapeHtml(note)}</div>` : ''}
          <div class="actions">
            <button class="secondary" data-action="setApiKey">${state.apiKeyConfigured ? 'Update API Key' : 'Set API Key'}</button>
            <button class="ghost" data-action="saveBaseUrl">Save Base URL</button>
            <button class="primary" data-action="testConnection">${state.connectionStatus === 'testing' ? 'Testing...' : 'Test Connection'}</button>
          </div>
          <div class="connection ${connectionClass}">
            ${escapeHtml(state.connectionMessage || (state.apiKeyConfigured ? 'API key configured. Run a connection test when ready.' : 'No API key saved yet.'))}
          </div>
        </div>
      </section>
    `;
  }

  function render() {
    normalizeSelection();
    const app = document.getElementById('app');

    app.innerHTML = `
      <div class="layout">
        <section class="topbar">
          <div>
            <div class="eyebrow">Aiora Code Agent</div>
            <h1>Workspace Agent Mode</h1>
            <p>${escapeHtml(state.provider)} / ${escapeHtml(state.model || 'Not configured')}</p>
          </div>
          <div class="toolbar">
            <button class="secondary" data-action="setApiKey">API Key</button>
            <button class="ghost" data-action="openSettings">Settings</button>
            <button class="ghost" data-action="resetConversation">Reset</button>
          </div>
        </section>

        ${state.error ? `<div class="error">${escapeHtml(state.error)}</div>` : ''}
        ${renderSetupCard()}

        <section class="composer card">
          <header>
            <h2>Agent Chat</h2>
            <div class="subtle">Create complete projects, edit files, run builds, inspect diagnostics, and stage safe diffs.</div>
          </header>
          <div class="card-body stack">
            <textarea id="prompt" placeholder="Example: Create a Next.js blogging platform with auth, Prisma, tests, and a clean folder structure."></textarea>
            <div class="actions">
              <button class="primary" data-action="submitPrompt" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Running...' : 'Run Agent'}</button>
              <button class="ghost" data-action="openDiffPreview">Open Diff Panel</button>
            </div>
          </div>
        </section>

        <section class="grid">
          <div class="panel card">
            <header><h2>Conversation</h2></header>
            <div class="card-body messages">${renderMessages()}</div>
          </div>

          <div class="panel card">
            <header><h2>Plan</h2></header>
            <div class="card-body stack">${renderPlan()}</div>
          </div>

          <div class="panel card full">
            <header><h2>Permission System</h2><div class="subtle">Set each tool family to Always Allow, Always Ask, or Always Deny.</div></header>
            <div class="card-body permissions">${renderPermissions()}</div>
          </div>

          <div class="panel card">
            <header><h2>Tool Activity</h2></header>
            <div class="card-body stack">${renderActivity()}</div>
          </div>

          <div class="panel card">
            <header><h2>Staged Changes</h2><div class="subtle">Review before applying workspace edits.</div></header>
            <div class="card-body stack">
              ${renderChanges()}
              <div class="actions">
                <button class="primary" data-action="approveChanges" ${state.pendingChanges.length ? '' : 'disabled'}>Apply Selected</button>
                <button class="secondary" data-action="rejectChanges" ${state.pendingChanges.length ? '' : 'disabled'}>Discard Selected</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    `;

    app.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.getAttribute('data-action');
        if (action === 'submitPrompt') {
          vscode.postMessage({
            type: 'submitPrompt',
            payload: document.getElementById('prompt').value
          });
          return;
        }

        let payload = button.getAttribute('data-payload') ?? undefined;
        if (action === 'approveChanges' || action === 'rejectChanges') {
          payload = Array.from(selectedChangeIds);
        }
        if (action === 'saveBaseUrl') {
          payload = document.getElementById('baseUrlInput').value;
        }

        const typeMap = {
          setApiKey: 'setApiKey',
          openSettings: 'openSettings',
          resetConversation: 'resetConversation',
          approveChanges: 'approveChanges',
          rejectChanges: 'rejectChanges',
          openDiffPreview: 'openDiffPreview',
          openChangeDiff: 'openChangeDiff',
          applySingleChange: 'applySingleChange',
          discardSingleChange: 'discardSingleChange',
          saveBaseUrl: 'saveBaseUrl',
          testConnection: 'testConnection'
        };
        vscode.postMessage({ type: typeMap[action], payload });
      });
    });

    app.querySelectorAll('[data-toggle-change]').forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const id = event.target.getAttribute('data-toggle-change');
        if (!id) {
          return;
        }
        if (event.target.checked) {
          selectedChangeIds.add(id);
        } else {
          selectedChangeIds.delete(id);
        }
      });
    });

    app.querySelectorAll('select[data-permission-id]').forEach((select) => {
      select.addEventListener('change', (event) => {
        vscode.postMessage({
          type: 'setPermissionMode',
          payload: {
            permissionId: event.target.getAttribute('data-permission-id'),
            mode: event.target.value
          }
        });
      });
    });

    const providerSelect = document.getElementById('providerSelect');
    if (providerSelect) {
      providerSelect.addEventListener('change', (event) => {
        vscode.postMessage({ type: 'setProvider', payload: event.target.value });
      });
    }

    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect) {
      modelSelect.addEventListener('change', (event) => {
        vscode.postMessage({ type: 'setModel', payload: event.target.value });
      });
    }
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
