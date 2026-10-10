// Draft Editor Tab component: Interactive In-App IDE Draft Studio
// Features: Live Markdown editor with line numbers, side-docked AI Co-Pilot,
// and VS Code-style "Audit & Compile Draft" button with a bottom diagnostics terminal.

import { $, $$ } from '../utils/dom.js';
import { escapeHtml, formatMarkdown } from '../utils/formatters.js';
import { showToast } from '../utils/toast.js';
import { api } from '../api.js';
import { store } from '../state.js';
import { MentionPopover } from './MentionPopover.js';

export class DraftEditorTabComponent {
  constructor({ onDraftAudited }) {
    this.onDraftAudited = onDraftAudited;

    // Editor elements
    this.textarea = $('#draftEditorTextarea');
    this.gutter = $('#editorLineNumbers');
    this.titleInput = $('#draftDocTitle');
    this.saveIndicator = $('#draftSaveIndicator');
    this.wordCountBadge = $('#draftWordCountBadge');
    this.charCountBadge = $('#draftCharCountBadge');
    this.btnInsertOutline = $('#btnInsertOutlineSkeleton');
    this.btnCompile = $('#btnCompileDraftReview');
    this.btnToggleTerminal = $('#btnToggleTerminal');

    // Terminal Drawer elements
    this.terminalDrawer = $('#studioTerminalDrawer');
    this.terminalTabs = $$('.terminal-tab-btn');
    this.terminalPanes = $$('.term-tab-pane');
    this.termProblemsCount = $('#termProblemsCount');
    this.termHealthScoreBadge = $('#termHealthScoreBadge');
    this.termProblemsList = $('#termProblemsList');
    this.termMetricHealth = $('#termMetricHealth');
    this.termMetricFRE = $('#termMetricFRE');
    this.termMetricFog = $('#termMetricFog');
    this.termMetricOverlap = $('#termMetricOverlap');
    this.termConsoleOutput = $('#termConsoleOutput');
    this.btnMinimizeTerminal = $('#btnMinimizeTerminal');

    // Docked Live Chat elements
    this.dockedChatMessages = $('#dockedChatMessages');
    this.dockedChatForm = $('#dockedChatForm');
    this.dockedChatInput = $('#dockedChatInput');
    this.dockedChips = $$('.docked-chip');

    this.saveTimer = null;
    this.isCompiling = false;
    this.isWaitingResponse = false;

    this.init();
  }

  init() {
    this.setupEditorEvents();
    this.setupTerminalEvents();
    this.setupDockedChat();

    // Subscribe to project changes
    store.subscribe('currentProject', (project) => {
      if (project) {
        this.loadProjectDraft(project.id);
      }
    });

    // Subscribe to chat messages to keep docked chat in sync
    store.subscribe('chatMessages', (messages) => {
      if (!this.isWaitingResponse) {
        this.renderDockedChat(messages || []);
      }
    });
  }

  setupEditorEvents() {
    if (!this.textarea) return;

    // Handle typing and auto-save
    this.textarea.addEventListener('input', () => {
      this.updateGutter();
      this.updateWordStats();
      this.queueAutoSave();
    });

    // Sync scroll with line numbers
    this.textarea.addEventListener('scroll', () => {
      if (this.gutter) {
        this.gutter.scrollTop = this.textarea.scrollTop;
      }
    });

    // Keyboard shortcuts: Tab key & Ctrl+Enter to compile
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        this.textarea.value = this.textarea.value.substring(0, start) + '  ' + this.textarea.value.substring(end);
        this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;
        this.updateGutter();
        this.queueAutoSave();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.compileAndAudit();
      }
    });

    // Title input auto-save
    this.titleInput?.addEventListener('input', () => this.queueAutoSave());

    // Insert Outline Skeleton Button
    this.btnInsertOutline?.addEventListener('click', (e) => {
      e?.preventDefault();
      this.insertOutlineSkeleton();
    });

    // Compile & Review Button
    this.btnCompile?.addEventListener('click', (e) => {
      e?.preventDefault();
      this.compileAndAudit();
    });

    // Toggle Terminal Button
    this.btnToggleTerminal?.addEventListener('click', (e) => {
      e?.preventDefault();
      this.terminalDrawer?.classList.toggle('hidden');
    });
  }

  setupTerminalEvents() {
    // Switch between Problems, Metrics, and Console Output
    this.terminalTabs.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e?.preventDefault();
        this.terminalTabs.forEach(b => b.classList.remove('active'));
        this.terminalPanes.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const paneId = btn.dataset.termTab;
        $(`#${paneId}`)?.classList.add('active');
      });
    });

    // Minimize button
    this.btnMinimizeTerminal?.addEventListener('click', (e) => {
      e?.preventDefault();
      this.terminalDrawer?.classList.add('hidden');
    });
  }

  setupDockedChat() {
    if (this.dockedChatInput) {
      this.mentionPopover = new MentionPopover(this.dockedChatInput);
    }
    this.dockedChatForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = this.dockedChatInput?.value?.trim();
      if (text) {
        this.sendDockedMessage(text);
      }
    });

    this.dockedChips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const prompt = chip.dataset.prompt;
        if (prompt) this.sendDockedMessage(prompt);
      });
    });
  }

  updateGutter() {
    if (!this.textarea || !this.gutter) return;
    const lines = this.textarea.value.split('\n').length;
    let numbersHtml = '';
    for (let i = 1; i <= lines; i++) {
      numbersHtml += `<div>${i}</div>`;
    }
    this.gutter.innerHTML = numbersHtml;
  }

  updateWordStats() {
    const text = this.textarea?.value || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const readMins = Math.max(1, Math.ceil(words / 200));

    if (this.wordCountBadge) this.wordCountBadge.textContent = `${words} words (~${readMins} min read)`;
    if (this.charCountBadge) this.charCountBadge.textContent = `${chars} chars`;
  }

  queueAutoSave() {
    if (this.saveIndicator) {
      this.saveIndicator.innerHTML = `<span class="spin-dot"></span> Saving...`;
      this.saveIndicator.classList.add('saving');
    }

    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(async () => {
      await this.saveDraft();
    }, 1200);
  }

  async saveDraft() {
    const project = store.getState('currentProject');
    if (!project) return;

    const title = this.titleInput?.value?.trim() || 'Survey Paper Draft';
    const content = this.textarea?.value || '';

    try {
      await api.saveDraft(project.id, { title, content });
      if (this.saveIndicator) {
        this.saveIndicator.innerHTML = `<span class="pulse-dot"></span> Saved`;
        this.saveIndicator.classList.remove('saving');
      }
    } catch (err) {
      if (this.saveIndicator) {
        this.saveIndicator.innerHTML = `⚠️ Save error`;
      }
    }
  }

  async loadProjectDraft(projectId) {
    try {
      const draft = await api.getDraft(projectId);
      if (draft) {
        if (this.titleInput) this.titleInput.value = draft.title || 'Survey Paper Draft';
        if (this.textarea) this.textarea.value = draft.content || '';
        this.updateGutter();
        this.updateWordStats();
      }
    } catch (err) {
      console.error(err);
    }
  }

  insertOutlineSkeleton() {
    const outline = store.getState('outline');
    const project = store.getState('currentProject');
    const sections = outline?.sections || [];

    if (sections.length === 0) {
      showToast('No outline generated yet. Generate an outline first or use standard template.', 'warning');
      return;
    }

    if (this.textarea.value.trim() && !confirm('Insert outline skeleton into the editor? Your existing draft will be saved.')) {
      return;
    }

    const parts = [
      `# ${project?.name || 'Academic Survey Paper'}\n`,
      `*Topic: ${project?.topic || 'Literature Survey and Methodological Analysis'}*\n`,
      `## Abstract\nSynthesize current methodologies, empirical findings, and foundational gaps across the literature.\n`
    ];

    sections.forEach(s => {
      const citText = (s.suggested_citations || []).length > 0 ? 
        `\n*Literature to cite: ${s.suggested_citations.join(', ')}*\n` : '';
      parts.push(`\n## ${s.number} ${s.title}\n${s.description || ''}${citText}\n<!-- Synthesize claims and compare approaches here -->\n`);
    });

    this.textarea.value = parts.join('\n');
    this.updateGutter();
    this.updateWordStats();
    this.queueAutoSave();
    showToast('Outline skeleton inserted into editor!', 'success');
  }

  // ----------------- "Audit & Compile Draft" Engine -----------------
  async compileAndAudit() {
    const project = store.getState('currentProject');
    if (!project) return;

    const draftText = this.textarea?.value?.trim();
    const draftTitle = this.titleInput?.value?.trim() || 'Survey Paper Draft';

    if (!draftText || draftText.split(/\s+/).length < 15) {
      showToast('Please write at least a few paragraphs (min 15 words) before compiling.', 'warning');
      return;
    }

    if (this.isCompiling) return;
    this.isCompiling = true;

    // Open terminal drawer and switch to Console tab
    this.terminalDrawer?.classList.remove('hidden');
    this.switchTerminalTab('termConsole');

    const btn = this.btnCompile;
    const origBtnHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = `<span class="spin-dot" style="border-top-color:white;"></span> Compiling...`;
      btn.disabled = true;
    }

    this.logConsole(`[${new Date().toLocaleTimeString()}] ▶ Compiling draft: "${draftTitle}"...`);
    this.logConsole(`[${new Date().toLocaleTimeString()}] Parsing markdown and sentence structure (${draftText.split(/\s+/).length} words)...`);
    this.logConsole(`[${new Date().toLocaleTimeString()}] Querying Hybrid RAG index (BM25 + TF-IDF) for source citation overlap...`);

    // Auto-save first
    await this.saveDraft();

    const formData = new FormData();
    formData.append('draft_title', draftTitle);
    formData.append('draft_text', draftText);

    try {
      const review = await api.submitDraft(project.id, formData);
      this.isCompiling = false;
      if (btn) {
        btn.innerHTML = origBtnHtml;
        btn.disabled = false;
      }

      this.logConsole(`[${new Date().toLocaleTimeString()}] ✓ Compilation complete! Health score: ${review.health_score}/100.`);
      this.logConsole(`[${new Date().toLocaleTimeString()}] Readability: Flesch ${review.readability?.flesch_reading_ease || 0}, Fog ${review.readability?.gunning_fog || 0}.`);
      this.logConsole(`[${new Date().toLocaleTimeString()}] Local literature overlap: ${review.overlap?.overall_overlap_pct || 0}% (${review.overlap?.risk_level || 'Clean'}).`);

      // Update terminal badges
      const health = review.health_score;
      if (this.termHealthScoreBadge) {
        this.termHealthScoreBadge.textContent = `Health: ${health}/100`;
        this.termHealthScoreBadge.style.color = health >= 75 ? 'var(--success)' : (health >= 50 ? 'var(--warning)' : 'var(--critical)');
      }

      // Populate Metrics
      if (this.termMetricHealth) this.termMetricHealth.textContent = `${health}/100`;
      if (this.termMetricFRE) this.termMetricFRE.textContent = `${review.readability?.flesch_reading_ease || 0}`;
      if (this.termMetricFog) this.termMetricFog.textContent = `${review.readability?.gunning_fog || 0} (${review.readability?.grade_level || ''})`;
      if (this.termMetricOverlap) this.termMetricOverlap.textContent = `${review.overlap?.overall_overlap_pct || 0}% (${review.overlap?.risk_level || 'Clean'})`;

      // Populate Problems
      this.renderProblems(review.issues || []);

      // Notify and trigger external reviews update
      showToast(`Draft Compiled! Health score: ${health}/100`, health >= 70 ? 'success' : 'info');
      this.onDraftAudited?.();

      // Switch to Problems view if issues found
      if ((review.issues || []).length > 0) {
        setTimeout(() => this.switchTerminalTab('termProblems'), 400);
      }
    } catch (err) {
      this.isCompiling = false;
      if (btn) {
        btn.innerHTML = origBtnHtml;
        btn.disabled = false;
      }
      this.logConsole(`[${new Date().toLocaleTimeString()}] ✕ Compilation failed: ${err.message}`);
    }
  }

  renderProblems(issues = []) {
    if (!this.termProblemsList) return;
    if (this.termProblemsCount) this.termProblemsCount.textContent = issues.length;

    this.termProblemsList.innerHTML = '';

    if (issues.length === 0) {
      this.termProblemsList.innerHTML = `
        <div class="term-clean-state">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Zero critical problems detected! Your draft meets structure, grounding, and readability standards.</span>
        </div>
      `;
      return;
    }

    issues.forEach(iss => {
      const item = document.createElement('div');
      item.className = `term-problem-item severity-${iss.severity}`;
      const badgeClass = iss.severity === 'critical' ? 'badge-critical' : (iss.severity === 'warning' ? 'badge-warning' : 'badge-info');

      item.innerHTML = `
        <div class="term-problem-header">
          <span class="badge ${badgeClass}">${iss.severity.toUpperCase()}</span>
          <strong class="term-problem-title">${escapeHtml(iss.title)}</strong>
          <span class="term-problem-loc">${escapeHtml(iss.location || 'Draft')}</span>
        </div>
        <div class="term-problem-desc">${escapeHtml(iss.description)}</div>
        <div class="term-problem-fix">
          <span class="fix-label">Suggested fix:</span> ${escapeHtml(iss.suggestion || 'Revise phrasing.')}
        </div>
      `;
      this.termProblemsList.appendChild(item);
    });
  }

  logConsole(line) {
    if (!this.termConsoleOutput) return;
    const div = document.createElement('div');
    div.className = 'console-line';
    div.textContent = line;
    this.termConsoleOutput.appendChild(div);
    this.termConsoleOutput.scrollTop = this.termConsoleOutput.scrollHeight;
  }

  switchTerminalTab(paneId) {
    this.terminalTabs.forEach(b => {
      b.classList.toggle('active', b.dataset.termTab === paneId);
    });
    this.terminalPanes.forEach(p => {
      p.classList.toggle('active', p.id === paneId);
    });
  }

  // ----------------- Docked Live Co-Pilot Chat -----------------
  renderDockedChat(messages = []) {
    if (!this.dockedChatMessages) return;
    this.dockedChatMessages.innerHTML = `
      <div class="chat-message assistant-message">
        <div class="message-avatar">✦</div>
        <div class="message-content">
          <p>Welcome! I'm your docked co-pilot. As you draft on the left, ask me for literature citations, taxonomy tables, or methodological trade-offs.</p>
          <p style="margin-top:6px; font-size:12px; color:var(--text-muted);">Press <strong>"Audit & Compile Draft"</strong> anytime to compile diagnostics into the terminal below.</p>
        </div>
      </div>
    `;
    messages.forEach(m => this.appendDockedChatMessage(m));
    this.scrollDockedToBottom();
  }

  async sendDockedMessage(text) {
    const project = store.getState('currentProject');
    const trimmed = text.trim();
    if (!project || !trimmed) return;

    if (this.dockedChatInput) this.dockedChatInput.value = '';

    const userMsg = { role: 'user', content: trimmed, citations: [] };
    this.appendDockedChatMessage(userMsg);

    this.isWaitingResponse = true;

    // Buffer indicator bubble
    const bufferDiv = document.createElement('div');
    bufferDiv.className = 'chat-message assistant-message chat-buffer-msg';
    bufferDiv.id = 'dockedTypingIndicator';
    bufferDiv.innerHTML = `
      <div class="message-avatar">✦</div>
      <div class="message-content buffer-content">
        <div class="chat-buffer-dots">
          <span></span><span></span><span></span>
        </div>
        <span class="buffer-text">Consulting literature corpus & LLM...</span>
      </div>
    `;
    this.dockedChatMessages?.appendChild(bufferDiv);
    this.scrollDockedToBottom();

    try {
      const res = await api.sendMessage(project.id, trimmed);
      this.isWaitingResponse = false;
      bufferDiv.remove();
      this.appendDockedChatMessage(res);

      // Sync state so both Live Co-Pilot and Full Chat tab stay in sync
      const currentMsgs = store.getState('chatMessages') || [];
      store.setState('chatMessages', [...currentMsgs, userMsg, res]);
    } catch (err) {
      this.isWaitingResponse = false;
      bufferDiv.remove();
      const errorDiv = document.createElement('div');
      errorDiv.className = 'chat-message assistant-message error-message';
      errorDiv.innerHTML = `
        <div class="message-avatar" style="background:var(--critical);">✕</div>
        <div class="message-content" style="border-color:#fca5a5; background:#fff5f5; color:#b91c1c;">
          <p>Failed to get response from AI Co-Pilot: ${escapeHtml(err.message || 'Check settings and API key')}</p>
        </div>
      `;
      this.dockedChatMessages?.appendChild(errorDiv);
      this.scrollDockedToBottom();
    }
  }

  appendDockedChatMessage(msg) {
    if (!this.dockedChatMessages) return;

    const div = document.createElement('div');
    const isAssistant = msg.role === 'assistant';
    div.className = `chat-message ${isAssistant ? 'assistant-message' : 'user-message'}`;

    div.innerHTML = `
      <div class="message-avatar">${isAssistant ? '✦' : '👤'}</div>
      <div class="message-content">
        ${formatMarkdown(msg.content)}
      </div>
    `;
    this.dockedChatMessages.appendChild(div);
    this.scrollDockedToBottom();
  }

  scrollDockedToBottom() {
    if (this.dockedChatMessages) {
      this.dockedChatMessages.scrollTop = this.dockedChatMessages.scrollHeight;
    }
  }
}
