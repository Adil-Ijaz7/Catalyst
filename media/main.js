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
    allowTerminalCommands: true,
    permissionsNoticeDismissed: false,
    attachedFiles: [],
    attachedImages: [],
    autoContext: true,
    attachedMentions: [],
    mentionsPickerResults: [],
    mentionsPickerIndex: 0,
    showMentionsPicker: false,
    agentStatus: 'idle',
    timeline: [],
    showThinkingAnimation: true,
    diffViewModes: {}
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function handleAgentEvent(ev) {
    if (!ev || !ev.type) return;

    if (ev.type === 'agent:start') {
      state.agentStatus = 'thinking';
      state.timeline = [
        { id: 'planning', label: 'Planning next steps', status: 'in_progress' },
        { id: 'searching', label: 'Searching Workspace', status: 'pending' },
        { id: 'executing', label: 'Executing Tools', status: 'pending' },
        { id: 'verifying', label: 'Verifying Changes', status: 'pending' },
        { id: 'diffing', label: 'Generating Diffs', status: 'pending' }
      ];
    } else if (ev.type === 'agent:thinking:start') {
      state.agentStatus = 'thinking';
      updateTimelineStep('planning', 'in_progress');
    } else if (ev.type === 'agent:thinking:update') {
      state.agentStatus = 'planning';
      updateTimelineStep('planning', 'completed');
    } else if (ev.type === 'agent:tool:start') {
      state.agentStatus = 'planning';
      updateTimelineStep('planning', 'completed');
      updateTimelineStep('executing', 'in_progress');
    } else if (ev.type === 'agent:file:read') {
      state.agentStatus = 'searching';
      updateTimelineStep('searching', 'in_progress');
    } else if (ev.type === 'agent:file:edit' || ev.type === 'agent:file:create' || ev.type === 'agent:file:delete' || ev.type === 'agent:file:rename') {
      state.agentStatus = 'editing';
      updateTimelineStep('executing', 'in_progress');
    } else if (ev.type === 'agent:verification') {
      state.agentStatus = 'applying_changes';
      updateTimelineStep('executing', 'completed');
      updateTimelineStep('verifying', 'in_progress');
      if (ev.payload && ev.payload.hashMatch) {
        updateTimelineStep('verifying', 'skipped');
      } else {
        updateTimelineStep('verifying', 'completed');
      }
    } else if (ev.type === 'agent:diff') {
      state.agentStatus = 'generating_diff';
      if (Array.isArray(ev.payload)) {
        state.pendingChanges = ev.payload;
      }
      updateTimelineStep('verifying', 'completed');
      updateTimelineStep('diffing', 'in_progress');
    } else if (ev.type === 'agent:complete') {
      state.agentStatus = 'completed';
      updateTimelineStep('planning', 'completed');
      updateTimelineStep('searching', 'completed');
      updateTimelineStep('executing', 'completed');
      updateTimelineStep('verifying', 'completed');
      updateTimelineStep('diffing', 'completed');
      state.busy = false;
    } else if (ev.type === 'agent:error') {
      state.agentStatus = 'completed';
      state.busy = false;
      state.timeline.forEach(step => {
        if (step.status === 'in_progress' || step.status === 'pending') {
          step.status = 'failed';
        }
      });
    }

    render();
  }

  function updateTimelineStep(id, status) {
    const step = state.timeline.find(s => s.id === id);
    if (step) {
      step.status = status;
    }
  }

  function renderTimelineIcon(status) {
    if (status === 'in_progress') {
      return '<svg class="spin" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM1.5 8a6.5 6.5 0 0 1 11.5-4l1.1-1.1A8 8 0 1 0 8 16v-1.5a6.5 6.5 0 0 1-6.5-6.5z"/></svg>';
    }
    if (status === 'completed') {
      return '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 1 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>';
    }
    if (status === 'failed') {
      return '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 1 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z"/></svg>';
    }
    if (status === 'skipped') {
      return '<span class="timeline-dash"></span>';
    }
    return '<span class="timeline-dot"></span>';
  }

  function assistantAvatar() {
    return '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.25 9.34 5.9 14 7.25 9.34 8.6 8 13.25 6.66 8.6 2 7.25 6.66 5.9 8 1.25z"/></svg>';
  }

  function renderActivityTimeline() {
    if (!state.timeline.length || state.pendingChanges?.length) return '';
    const stepsHtml = state.timeline.map(step => {
      let icon = 'pending';
      if (step.status === 'in_progress') {
        icon = `<svg class="spin" style="width:12px;height:12px;" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM1.5 8a6.5 6.5 0 0 1 11.5-4l1.1-1.1A8 8 0 1 0 8 16v-1.5a6.5 6.5 0 0 1-6.5-6.5z"/></svg>`;
      } else if (step.status === 'completed') {
        icon = 'completed';
      } else if (step.status === 'failed') {
        icon = 'failed';
      } else if (step.status === 'skipped') {
        icon = 'skipped';
      }
      icon = renderTimelineIcon(step.status);
      return `
        <div class="timeline-step ${step.status}">
          <span class="timeline-icon">${icon}</span>
          <span>${escapeHtml(step.label)}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="timeline-container">
        <div class="timeline-header">Activity Timeline</div>
        <div class="timeline-steps">
          ${stepsHtml}
        </div>
      </div>
    `;
  }

  function renderThinkingAnimation() {
    if (!state.showThinkingAnimation || state.agentStatus === 'idle' || state.agentStatus === 'completed' || !state.busy) return '';
    const statusLabels = {
      thinking: 'Thinking...',
      planning: 'Planning next steps...',
      searching: 'Searching workspace...',
      editing: 'Editing files...',
      applying_changes: 'Applying changes...',
      generating_diff: 'Generating diffs...'
    };
    const label = statusLabels[state.agentStatus] || 'Running...';
    return `
      <div class="thinking-animation">
        <div class="thinking-dots">
          <div class="thinking-dot"></div>
          <div class="thinking-dot"></div>
          <div class="thinking-dot"></div>
        </div>
        <span>${escapeHtml(label)}</span>
      </div>
    `;
  }

  function renderGitDiffViewer(change) {
    if (!change.diff) return '<div style="padding:8px;font-size:11px;color:var(--muted);">No diff content available.</div>';
    const diffLines = change.diff.split('\n');
    let viewMode = state.diffViewModes[change.id] || 'inline';

    let inlineHtml = '';
    let leftLines = [];
    let rightLines = [];

    let leftLineNum = 1;
    let rightLineNum = 1;

    diffLines.forEach(line => {
      if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('index') || line.startsWith('diff')) {
        inlineHtml += `<div class="diff-line diff-line-header"><span class="diff-line-content">${escapeHtml(line)}</span></div>`;
      } else if (line.startsWith('@@')) {
        inlineHtml += `<div class="diff-line diff-line-header"><span class="diff-line-content">${escapeHtml(line)}</span></div>`;
        const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
        if (match) {
          leftLineNum = parseInt(match[1], 10);
          rightLineNum = parseInt(match[2], 10);
        }
      } else if (line.startsWith('+')) {
        inlineHtml += `
          <div class="diff-line diff-line-added">
            <span class="diff-line-num"></span>
            <span class="diff-line-num">${rightLineNum++}</span>
            <span class="diff-line-content">${escapeHtml(line)}</span>
          </div>
        `;
        rightLines.push({ num: rightLineNum - 1, content: line, type: 'added' });
      } else if (line.startsWith('-')) {
        inlineHtml += `
          <div class="diff-line diff-line-removed">
            <span class="diff-line-num">${leftLineNum++}</span>
            <span class="diff-line-num"></span>
            <span class="diff-line-content">${escapeHtml(line)}</span>
          </div>
        `;
        leftLines.push({ num: leftLineNum - 1, content: line, type: 'removed' });
      } else {
        inlineHtml += `
          <div class="diff-line">
            <span class="diff-line-num">${leftLineNum++}</span>
            <span class="diff-line-num">${rightLineNum++}</span>
            <span class="diff-line-content">${escapeHtml(line)}</span>
          </div>
        `;
        leftLines.push({ num: leftLineNum - 1, content: line, type: 'normal' });
        rightLines.push({ num: rightLineNum - 1, content: line, type: 'normal' });
      }
    });

    let diffViewHtml = '';
    if (viewMode === 'inline') {
      diffViewHtml = `<div class="diff-content">${inlineHtml}</div>`;
    } else {
      let leftPaneHtml = '';
      let rightPaneHtml = '';
      const maxLines = Math.max(leftLines.length, rightLines.length);
      for (let i = 0; i < maxLines; i++) {
        const left = leftLines[i] || { num: '', content: '', type: 'empty' };
        const right = rightLines[i] || { num: '', content: '', type: 'empty' };

        leftPaneHtml += `
          <div class="diff-line diff-line-${left.type}">
            <span class="diff-line-num">${left.num}</span>
            <span class="diff-line-content">${escapeHtml(left.content)}</span>
          </div>
        `;
        rightPaneHtml += `
          <div class="diff-line diff-line-${right.type}">
            <span class="diff-line-num">${right.num}</span>
            <span class="diff-line-content">${escapeHtml(right.content)}</span>
          </div>
        `;
      }

      diffViewHtml = `
        <div class="side-by-side">
          <div class="side-pane">${leftPaneHtml}</div>
          <div class="side-pane">${rightPaneHtml}</div>
        </div>
      `;
    }

    return `
      <div class="diff-container" data-change-id="${change.id}">
        <div class="diff-header" style="padding: 4px 8px;">
          <span style="font-size: 10px; color: var(--muted);">View Mode:</span>
          <div class="diff-view-mode">
            <button class="diff-view-btn ${viewMode === 'inline' ? 'active' : ''}" data-change-id="${change.id}" data-mode="inline" style="padding: 1px 4px; font-size: 9px;">Inline</button>
            <button class="diff-view-btn ${viewMode === 'side-by-side' ? 'active' : ''}" data-change-id="${change.id}" data-mode="side-by-side" style="padding: 1px 4px; font-size: 9px;">Split</button>
          </div>
        </div>
        ${diffViewHtml}
      </div>
    `;
  }

  function parseMarkdown(text) {
    if (!text) return '';

    // Normalize line endings
    text = text.replace(/\r/g, '');

    const codeBlocks = [];
    text = text.replace(/```[^\n]*\n?([\s\S]*?)```/g, (match, code) => {
      codeBlocks.push(code);
      return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    const toolBlocks = [];
    text = text.replace(/__TOOL_EXECUTION_START__\n([\s\S]*?)\n__TOOL_EXECUTION_END__/g, (match, actionStr) => {
      toolBlocks.push(actionStr.trim());
      return `__TOOL_BLOCK_${toolBlocks.length - 1}__`;
    });

    const artifactBlocks = [];
    text = text.replace(/\[ARTIFACT:\s*([^\]]+)\]/g, (match, name) => {
      artifactBlocks.push(name.trim());
      return `__ARTIFACT_BLOCK_${artifactBlocks.length - 1}__`;
    });

    // Parse markdown tables before escaping
    const tableBlocks = [];
    text = text.replace(/((?:^[ \t]*\|.+\|[ \t]*$\n?){2,})/gm, (tableBlock) => {
      const rows = tableBlock.trim().split('\n').filter(r => r.trim());
      if (rows.length < 2) return tableBlock;

      // Check if second row is separator (|---|---|)
      const isSeparator = (row) => /^\|[\s\-:]+(\|[\s\-:]+)*\|?\s*$/.test(row.trim());
      
      let headerRow = null;
      let dataRows = [];
      let startIdx = 0;

      if (rows.length >= 2 && isSeparator(rows[1])) {
        headerRow = rows[0];
        startIdx = 2;
      }

      for (let i = startIdx; i < rows.length; i++) {
        if (!isSeparator(rows[i])) {
          dataRows.push(rows[i]);
        }
      }

      const parseCells = (row) => {
        return row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      };

      let tableHtml = '<table style="width:100%;border-collapse:collapse;font-size:12px;margin:8px 0;border:1px solid var(--border);border-radius:4px;overflow:hidden;">';
      
      if (headerRow) {
        const cells = parseCells(headerRow);
        tableHtml += '<thead><tr>';
        cells.forEach(cell => {
          tableHtml += `<th style="padding:6px 10px;text-align:left;border-bottom:2px solid var(--border);background:var(--panel);font-weight:600;color:var(--text);font-size:11px;">${cell}</th>`;
        });
        tableHtml += '</tr></thead>';
      }

      tableHtml += '<tbody>';
      dataRows.forEach((row, rIdx) => {
        const cells = parseCells(row);
        const bgColor = rIdx % 2 === 0 ? 'transparent' : 'var(--panel)';
        tableHtml += '<tr>';
        cells.forEach(cell => {
          tableHtml += `<td style="padding:5px 10px;border-bottom:1px solid var(--border);color:var(--text);font-size:12px;background:${bgColor};">${cell}</td>`;
        });
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody></table>';

      tableBlocks.push(tableHtml);
      return `__TABLE_BLOCK_${tableBlocks.length - 1}__`;
    });

    let html = escapeHtml(text);

    // Headings
    html = html.replace(/^###\s+(.*)$/gm, '<h3 style="font-size:14px;font-weight:600;margin:12px 0 6px 0;color:var(--text);">$1</h3>');
    html = html.replace(/^##\s+(.*)$/gm, '<h2 style="font-size:15px;font-weight:700;margin:14px 0 6px 0;color:var(--text);">$1</h2>');

    html = html.replace(/\*\*([^\*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code style="background: var(--panel); padding: 2px 4px; border-radius: 3px; color: var(--accent); font-family: monospace;">$1</code>');
    
    // Parse list items
    html = html.replace(/^\s*[\-\*]\s+(.*)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, (match) => {
      if (!match.startsWith('<ul>')) return '<ul style="margin:6px 0;padding-left:20px;">' + match + '</ul>';
      return match;
    });

    // Remove standalone separator lines (---) that aren't in tables
    html = html.replace(/^\s*[-_*]{3,}\s*$/gm, '');

    html = html.replace(/\n/g, '<br/>');

    // Restore table blocks (they were already rendered as HTML)
    html = html.replace(/__TABLE_BLOCK_(\d+)__/g, (match, index) => {
      return tableBlocks[index];
    });

    html = html.replace(/__TOOL_BLOCK_(\d+)__/g, (match, index) => {
      let actionStr = escapeHtml(toolBlocks[index]);
      actionStr = actionStr.replace(/`([^`]+)`/g, '<code style="background: var(--panel-strong); padding: 2px 4px; border-radius: 3px; color: var(--accent); font-family: monospace;">$1</code>');
      return `
        <div style="background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; margin: 8px 0;">
          <div style="display: flex; align-items: center; gap: 6px; font-weight: 500; font-size: 12px; color: var(--text);">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="#3fb950"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>
            Proceeded with
          </div>
          <div style="margin-top: 4px; font-size: 12px; color: var(--muted); padding-left: 20px;">
            ${actionStr}
          </div>
        </div>
      `;
    });

    html = html.replace(/__ARTIFACT_BLOCK_(\d+)__/g, (match, index) => {
      let name = escapeHtml(artifactBlocks[index]);
      return `
        <div class="artifact-card" style="background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; margin: 8px 0; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: background 0.1s;" onclick="vscode.postMessage({ type: 'openFile', payload: '${name}' })" onmouseover="this.style.background='var(--panel-strong)'" onmouseout="this.style.background='var(--panel)'">
          <div style="background: var(--panel-strong); padding: 6px; border-radius: 4px; border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.25C1 2.284 1.784 1.5 2.75 1.5h1zm1.5 1.5v11c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-9.5H10.5A1.5 1.5 0 0 1 9 3.25V1.5H3.75a.25.25 0 0 0-.25.25zM10.5 3.25V1.5l3.5 3.5h-3.5a.25.25 0 0 1-.25-.25z"/></svg>
          </div>
          <div style="display: flex; flex-direction: column;">
            <span style="font-weight: 600; font-size: 12px; color: var(--text);">${name}</span>
            <span style="font-size: 10px; color: var(--muted);">Artifact</span>
          </div>
        </div>
      `;
    });

    html = html.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
      let code = escapeHtml(codeBlocks[index]);
      return `<pre style="background: var(--panel); padding: 10px; border-radius: 4px; overflow-x: auto; margin: 8px 0; border: 1px solid var(--border); font-family: monospace; white-space: pre;"><code>${code}</code></pre>`;
    });

    // Clean up excessive <br/> runs
    html = html.replace(/(<br\/>){3,}/g, '<br/><br/>');

    return html;
  }

  function getFileIcon(filename) {
    if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'TS';
    if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'JS';
    if (filename.endsWith('.css')) return '#';
    if (filename.endsWith('.json')) return '{}';
    if (filename.endsWith('.md')) return 'MD';
    return 'FILE';
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
              <div class="icon">${assistantAvatar()}</div>
              CodeAgent
            </div>
            <div class="thought-block">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 6h8v2H4zm0 5h5v-2H4zm-2.5-9A1.5 1.5 0 0 1 3 0h10a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 13 13h-3l-4 3v-3H3A1.5 1.5 0 0 1 1.5 11.5v-10z"/></svg>
              Thought for a moment
            </div>
            <div style="font-size: 13px; line-height: 1.5; color: var(--text);">${parseMarkdown(msg.content)}</div>
          </div>
        `;
      }
    });

    if (state.streamingText) {
      html += `
        <div class="message assistant">
          <div class="assistant-header">
            <div class="icon">${assistantAvatar()}</div>
            CodeAgent
          </div>
          <div style="font-size: 13px; line-height: 1.5; color: var(--text);">${parseMarkdown(state.streamingText)}</div>
        </div>
      `;
    }

    return html;
  }

  function selectMention(mention) {
    if (!state.attachedMentions.some(m => m.id === mention.id)) {
      state.attachedMentions.push(mention);
    }
    state.showMentionsPicker = false;
    state.mentionsPickerResults = [];
    
    const promptEl = document.getElementById('prompt');
    if (promptEl) {
      const text = promptEl.value;
      const lastIndex = text.lastIndexOf('@');
      if (lastIndex !== -1) {
        promptEl.value = text.slice(0, lastIndex);
      }
      promptEl.focus();
    }
    render();
  }

  function renderMentionsPicker() {
    if (!state.showMentionsPicker || !state.mentionsPickerResults.length) return '';
    
    const itemsHtml = state.mentionsPickerResults.map((item, idx) => `
      <div class="mention-picker-item ${idx === state.mentionsPickerIndex ? 'active' : ''}" data-idx="${idx}" style="display: flex; flex-direction: column; padding: 6px 12px; cursor: pointer; border-bottom: 1px solid var(--border);">
        <span class="mention-picker-item-label" style="font-size: 12px; font-weight: 600;">${escapeHtml(item.label)}</span>
        <span class="mention-picker-item-detail" style="font-size: 10px; color: var(--muted);">${escapeHtml(item.detail || '')}</span>
      </div>
    `).join('');

    return `
      <div class="mention-picker-overlay" id="mentionPickerContainer">
        ${itemsHtml}
      </div>
    `;
  }

  function renderContextPanel() {
    if (!state.attachedFiles.length && !state.attachedImages.length && !state.attachedMentions.length) return '';
    
    const filesHtml = state.attachedFiles.map((file, idx) => `
      <div class="attachment-pill file-pill" style="display: inline-flex; align-items: center; gap: 4px; background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 2px 6px; font-size: 11px;">
        <span>${getFileIcon(file.name)} ${escapeHtml(file.name)}</span>
        <span class="remove-attachment" data-remove-type="file" data-remove-idx="${idx}" style="cursor: pointer; color: var(--muted); margin-left: 2px; font-weight: bold;">&times;</span>
      </div>
    `).join('');

    const imagesHtml = state.attachedImages.map((img, idx) => `
      <div class="attachment-pill image-pill" style="position: relative; display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; background: var(--panel); padding: 2px; height: 42px; width: 50px;">
        <img src="${img.webviewUri}" style="height: 100%; width: 100%; object-fit: cover; border-radius: 4px;" />
        <span class="remove-attachment" data-remove-type="image" data-remove-idx="${idx}" style="position: absolute; top: 0px; right: 2px; cursor: pointer; color: var(--danger); font-weight: bold; font-size: 14px; text-shadow: 0 0 2px black;">&times;</span>
      </div>
    `).join('');

    const mentionsHtml = state.attachedMentions.map((mention, idx) => {
      let detail = mention.detail || '';
      if (mention.type === 'file') {
        const sizeKb = mention.size ? (mention.size / 1024).toFixed(1) : '0';
        const date = mention.mtime ? new Date(mention.mtime).toLocaleDateString() : 'unknown';
        detail = `Path: ${mention.value}\nSize: ${sizeKb} KB\nModified: ${date}`;
      }
      return `
        <div class="mention-chip" data-idx="${idx}">
          <span>@ ${escapeHtml(mention.label)}</span>
          <span class="remove-mention" data-idx="${idx}" style="cursor: pointer; margin-left: 4px; font-weight: bold;">&times;</span>
          <div class="mention-chip-hover-preview">
            ${detail.replace(/\n/g, '<br/>')}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="context-panel" style="margin-bottom: 8px;">
        <div class="context-panel-header" style="font-size: 10px; color: var(--muted); font-weight: bold; margin-bottom: 4px;">Workspace Context</div>
        <div class="context-panel-items" style="display: flex; gap: 6px; flex-wrap: wrap;">
          ${filesHtml}
          ${imagesHtml}
          ${mentionsHtml}
        </div>
      </div>
    `;
  }

  function renderPendingChanges() {
    if (!state.pendingChanges || !state.pendingChanges.length) return '';

    if (!state.expandedDiffs) {
      state.expandedDiffs = {};
    }

    const filesHtml = state.pendingChanges.map(change => {
      let additions = 0;
      let deletions = 0;
      if (change.diff) {
        change.diff.split('\n').forEach(line => {
          if (line.startsWith('+') && !line.startsWith('+++')) additions++;
          else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
        });
      }
      
      const statsHtml = change.diff ? `
        <span class="stat-add">+${additions}</span>
        <span class="stat-sub">-${deletions}</span>
      ` : '';

      return `
        <div class="file-row-container review-file-card" data-action="openChangeDiff" data-change-id="${change.id}" title="Open VS Code diff editor">
          <div class="review-file-main">
            <div class="file-badge">${getFileIcon(change.path)}</div>
            <div class="review-file-meta">
              <div class="review-file-path">${escapeHtml(change.path)}</div>
              <div class="review-file-subtitle">Click to review diff in editor</div>
            </div>
          </div>
          <div class="file-review-actions">
            <div class="file-stats">${statsHtml}</div>
            <button class="primary compact" data-action="applySingleChange" data-change-id="${change.id}">Approve</button>
            <button class="ghost compact" data-action="discardSingleChange" data-change-id="${change.id}">Discard</button>
          </div>
        </div>
      `;
    }).join('');

    const totalStats = state.pendingChanges.reduce((acc, change) => {
      if (change.diff) {
        change.diff.split('\n').forEach(line => {
          if (line.startsWith('+') && !line.startsWith('+++')) acc.additions++;
          else if (line.startsWith('-') && !line.startsWith('---')) acc.deletions++;
        });
      }
      return acc;
    }, { additions: 0, deletions: 0 });
    const changedFiles = state.pendingChanges.map(change => change.path).join(', ');

    return `
      <div class="action-card review-card">
        <header>
          <span>${state.pendingChanges.length} file${state.pendingChanges.length === 1 ? '' : 's'} changed</span>
          <span class="review-summary">
            <span class="stat-add">+${totalStats.additions}</span>
            <span class="stat-sub">-${totalStats.deletions}</span>
          </span>
        </header>
        <div class="card-body">
          <div class="file-list">
            ${filesHtml}
          </div>
          <div class="actions" style="margin-top: 12px;">
            <button class="primary" data-action="approveChanges">Apply Approved Changes</button>
            <button class="ghost" data-action="rejectChanges">Discard</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderPermissions() {
    if (state.permissionsNoticeDismissed) return '';
    const askCount = state.permissions.filter(p => p.mode === 'ask').length;
    if (askCount === 0) return '';
    return `
      <div class="action-card warning">
        <header>
          <div style="display: flex; align-items: center; gap: 6px;">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5l7 12H1l7-12zm-.5 9v1.5h1V10.5h-1zm0-4v3h1v-3h-1z"/></svg>
            Workspace Permissions
          </div>
          <button class="ghost" data-action="dismissPermissionsNotice" style="padding: 2px; margin: -2px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; color: var(--muted); cursor: pointer;" title="Dismiss notice">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>
          </button>
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
              <input type="password" id="apiKeyInput" placeholder="${state.apiKeyConfigured ? 'API key saved' : 'Enter API Key'}" />
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
          <div class="settings-row-inline">
            <div>
              <span class="settings-label">Show Thinking Animation</span>
              <div class="settings-description">Animate reasoning phases during runs.</div>
            </div>
            <label class="switch">
              <input type="checkbox" id="showThinkingAnimationInput" ${state.showThinkingAnimation ? 'checked' : ''} />
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
    try {
    const app = document.getElementById('app');
    if (!app) return;

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
          ${renderActivityTimeline()}
          ${renderThinkingAnimation()}
          ${renderPermissions()}
          ${state.error ? `<div class="message user" style="border-color: var(--danger); color: var(--danger);">${escapeHtml(state.error)}</div>` : ''}
          <div class="review-shelf">
            ${renderPendingChanges()}
          </div>
        </div>

        <div class="composer-container" style="position: relative;">
          ${renderMentionsPicker()}
          <div class="composer-pills">
            <div class="pill" data-tab-target="settings">Settings</div>
            <div class="pill" data-action="resetConversation">Reset Chat</div>
          </div>
          
          <div class="composer-input-area" style="position: relative;">
            <div id="addContextDropdown" class="context-dropdown" style="display: none; position: absolute; bottom: 44px; left: 8px; background: var(--panel-strong); border: 1px solid var(--border); border-radius: var(--radius); padding: 4px 0; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
              <div class="dropdown-item" id="dropdownAddFile" style="padding: 6px 12px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                <span>Mention File</span>
              </div>
              <div class="dropdown-item" id="dropdownAddImage" style="padding: 6px 12px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                <span>Attach Image</span>
              </div>
            </div>

            ${renderContextPanel()}
            <textarea id="prompt" placeholder="Ask anything, type @ for files/context..." rows="1"></textarea>
            
            <div class="composer-bottom">
              <div class="composer-tools">
                <button class="secondary" id="addContextBtn" style="padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; height: 22px; background: transparent; color: var(--muted); border: 1px solid var(--border);" title="Add context (files, images)">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>
                  <span>Context</span>
                </button>
                <select id="modelSelect">
                  ${state.modelOptions.map((model) => `
                    <option value="${escapeHtml(model)}" ${model === state.model ? 'selected' : ''}>${escapeHtml(model)}</option>
                  `).join('')}
                </select>
                <span class="composer-tool-btn" id="toolMention" style="cursor: pointer; font-size: 11px; display: inline-flex; align-items: center; gap: 2px;"><svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M14.5 3a.5.5 0 0 0-.5-.5H9.5a.5.5 0 0 0 0 1H13v3.5a.5.5 0 0 0 1 0V3zM1.5 13a.5.5 0 0 0 .5.5h4.5a.5.5 0 0 0 0-1H3v-3.5a.5.5 0 0 0-1 0V13zm12-3.5a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1 0-1H13v-2.5a.5.5 0 0 1 .5-.5zM3 3.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1H3.5v2.5a.5.5 0 0 1-1 0V3.5z"/></svg>Mention</span>
                <span class="composer-tool-btn" id="toolImage" style="cursor: pointer; font-size: 11px; display: inline-flex; align-items: center; gap: 2px;"><svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M.002 3a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2V3zm1 9l4-4 3 3 5-5 2 2V3a1 1 0 0 0-1-1h-12a1 1 0 0 0-1 1v9.586z"/></svg>Image</span>
                <span class="composer-tool-btn" id="toolAuto" style="cursor: pointer; font-size: 11px; display: inline-flex; align-items: center; gap: 2px; color: ${state.autoContext ? 'var(--accent)' : 'var(--muted)'}"><svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 13a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/></svg>Auto</span>
              </div>
              <button class="send-btn" data-action="${state.busy ? 'stopPrompt' : 'submitPrompt'}" style="display: flex; align-items: center; justify-content: center; padding: 4px;">
                ${state.busy ? 
                  '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="1.2em" width="1.2em" xmlns="http://www.w3.org/2000/svg"><path d="M6 6h12v12H6z"></path></svg>' : 
                  '<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 24 24" height="1.2em" width="1.2em" xmlns="http://www.w3.org/2000/svg"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>'}
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

          // Mentions trigger check
          const text = this.value;
          const lastAt = text.lastIndexOf('@');
          if (lastAt !== -1 && (lastAt === 0 || /\s/.test(text[lastAt - 1]))) {
            const query = text.slice(lastAt);
            if (!query.includes(' ') && !query.includes('\n')) {
              state.showMentionsPicker = true;
              vscode.postMessage({ type: 'queryMentions', payload: { query } });
            } else {
              state.showMentionsPicker = false;
              renderMentionsPicker();
            }
          } else {
            state.showMentionsPicker = false;
            renderMentionsPicker();
          }
        });

        textarea.addEventListener('keydown', function(e) {
          if (state.showMentionsPicker && state.mentionsPickerResults.length > 0) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              state.mentionsPickerIndex = (state.mentionsPickerIndex + 1) % state.mentionsPickerResults.length;
              renderMentionsPicker();
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              state.mentionsPickerIndex = (state.mentionsPickerIndex - 1 + state.mentionsPickerResults.length) % state.mentionsPickerResults.length;
              renderMentionsPicker();
              return;
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              selectMention(state.mentionsPickerResults[state.mentionsPickerIndex]);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              state.showMentionsPicker = false;
              renderMentionsPicker();
              return;
            }
          }

          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.querySelector('.send-btn').click();
          }
        });
      }

      // Bind prompt submittal with attachments support
      app.querySelectorAll('[data-action]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const action = button.getAttribute('data-action');
          if (action === 'submitPrompt') {
            const val = document.getElementById('prompt').value;
            if (val.trim() || state.attachedFiles.length || state.attachedImages.length || state.attachedMentions.length) {
              vscode.postMessage({
                type: 'submitPrompt',
                payload: {
                  prompt: val,
                  attachedFiles: state.attachedFiles,
                  attachedImages: state.attachedImages,
                  attachedMentions: state.attachedMentions,
                  autoContext: state.autoContext
                }
              });
              state.attachedFiles = [];
              state.attachedImages = [];
              state.attachedMentions = [];
              document.getElementById('prompt').value = '';
              render();
            }
            return;
          }

          if (action === 'dismissPermissionsNotice') {
            state.permissionsNoticeDismissed = true;
            render();
            vscode.postMessage({ type: 'dismissPermissionsNotice' });
            return;
          }

          if (action === 'stopPrompt') {
            vscode.postMessage({ type: 'stopPrompt' });
            return;
          }

          if (action === 'openChangeDiff') {
            vscode.postMessage({ type: 'openChangeDiff', payload: button.getAttribute('data-change-id') });
            return;
          }

          if (action === 'applySingleChange') {
            vscode.postMessage({ type: 'applySingleChange', payload: button.getAttribute('data-change-id') });
            return;
          }

          if (action === 'discardSingleChange') {
            vscode.postMessage({ type: 'discardSingleChange', payload: button.getAttribute('data-change-id') });
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

      // Bind remove attachment/mention clicks
      app.querySelectorAll('.remove-attachment').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const type = el.getAttribute('data-remove-type');
          const idx = parseInt(el.getAttribute('data-remove-idx'), 10);
          if (type === 'file') {
            state.attachedFiles.splice(idx, 1);
          } else if (type === 'image') {
            state.attachedImages.splice(idx, 1);
          }
          render();
        });
      });

      app.querySelectorAll('.remove-mention').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(el.getAttribute('data-idx'), 10);
          state.attachedMentions.splice(idx, 1);
          render();
        });
      });

      // Click to toggle diff collapsibles
      app.querySelectorAll('[data-action="toggleDiff"]').forEach((el) => {
        el.addEventListener('click', (e) => {
          const changeId = el.getAttribute('data-change-id');
          state.expandedDiffs[changeId] = !state.expandedDiffs[changeId];
          render();
        });
      });

      app.querySelectorAll('.review-file-card').forEach((el) => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('button')) {
            return;
          }
          vscode.postMessage({ type: 'openChangeDiff', payload: el.getAttribute('data-change-id') });
        });
      });

      // Diff Inline/Split toggle buttons
      app.querySelectorAll('.diff-view-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const changeId = btn.getAttribute('data-change-id');
          const mode = btn.getAttribute('data-mode');
          state.diffViewModes[changeId] = mode;
          render();
        });
      });

      // Bind Add Context Dropdown toggle
      const addContextBtn = document.getElementById('addContextBtn');
      const addContextDropdown = document.getElementById('addContextDropdown');
      if (addContextBtn && addContextDropdown) {
        addContextBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isVisible = addContextDropdown.style.display === 'block';
          addContextDropdown.style.display = isVisible ? 'none' : 'block';
        });
        
        // Close dropdown when clicking elsewhere
        document.addEventListener('click', () => {
          addContextDropdown.style.display = 'none';
        });
      }

      // Bind dropdown and toolbar buttons
      const bindAction = (id, msgType) => {
        const el = document.getElementById(id);
        if (el) {
          el.addEventListener('click', () => {
            vscode.postMessage({ type: msgType });
          });
        }
      };

      bindAction('toolMention', 'selectFile');
      bindAction('dropdownAddFile', 'selectFile');
      bindAction('toolImage', 'selectImage');
      bindAction('dropdownAddImage', 'selectImage');

      // Bind Auto context toggle
      const toolAuto = document.getElementById('toolAuto');
      if (toolAuto) {
        toolAuto.addEventListener('click', () => {
          state.autoContext = !state.autoContext;
          render();
        });
      }

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

      const showThinkingAnimationInput = document.getElementById('showThinkingAnimationInput');
      if (showThinkingAnimationInput) {
        showThinkingAnimationInput.addEventListener('change', (e) => {
          state.showThinkingAnimation = e.target.checked;
          render();
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

    } catch (err) {
      const app = document.getElementById('app');
      if (app) {
        app.innerHTML = `<div style="padding:20px;color:#ef4444;font-size:13px;"><strong>Render Error:</strong><br/><pre style="white-space:pre-wrap;color:#ef4444;">${String(err?.message || err)}\n${String(err?.stack || '')}</pre></div>`;
      }
      console.error('Catalyst render error:', err);
    }
  }

  window.addEventListener('message', (event) => {
    if (event.data?.type === 'state') {
      Object.assign(state, event.data.payload);
      render();
    } else if (event.data?.type === 'agentEvent') {
      handleAgentEvent(event.data.payload);
    } else if (event.data?.type === 'mentionsResults') {
      state.mentionsPickerResults = event.data.payload;
      state.mentionsPickerIndex = 0;
      render();
    } else if (event.data?.type === 'filesSelected') {
      const selected = event.data.payload;
      selected.forEach(file => {
        if (!state.attachedFiles.some(f => f.path === file.path)) {
          state.attachedFiles.push(file);
        }
      });
      render();
    } else if (event.data?.type === 'imagesSelected') {
      const selected = event.data.payload;
      selected.forEach(img => {
        if (!state.attachedImages.some(i => i.path === img.path)) {
          state.attachedImages.push(img);
        }
      });
      render();
    }
  });

  try {
    render();
    vscode.postMessage({ type: 'ready' });
  } catch (initErr) {
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML = `<div style="padding:20px;color:#ef4444;font-size:13px;"><strong>Init Error:</strong><br/><pre style="white-space:pre-wrap;color:#ef4444;">${String(initErr?.message || initErr)}\n${String(initErr?.stack || '')}</pre></div>`;
    }
    console.error('Catalyst init error:', initErr);
  }
})();
