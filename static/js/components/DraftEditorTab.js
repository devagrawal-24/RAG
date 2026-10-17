// DraftEditorTab.js — IEEE LaTeX Draft Studio IDE
// Features:
//   • Real IEEEtran LaTeX Editor powered by CodeMirror 5
//   • Dual-column PDF rendering via pdf.js + PyMuPDF fallback
//   • Pre-compile client diagnostics + Real backend LaTeX build
//   • Collapsible Bottom VS Code Drawer: Problems | Log | Audit & Health
//   • Word & character counter excluding syntax and math
//   • Automatic Markdown detection & one-click lossless conversion
//   • Debounced autosave (800ms) with status cycling and version history
//   • BibTeX integration from Literature Papers with autocomplete
//   • Resizable split pane with persistence and keyboard shortcuts

import { $, $$ } from '../utils/dom.js';
import { escapeHtml } from '../utils/formatters.js';
import { showToast } from '../utils/toast.js';
import { api } from '../api.js';
import { store } from '../state.js';

import { DraftCodeMirrorEditor } from '../draft/editor.js';
import { CompileManager } from '../draft/compile.js';
import { AutoSaveManager } from '../draft/autosave.js';
import { runClientPreCompileAudit } from '../draft/diagnostics.js';
import { isMarkdownContent, convertMarkdownToLatex } from '../draft/markdown.js';
import { IEEE_FULL_TEMPLATE, generateIeeeOutline } from '../draft/templates.js';
import { calculateLatexCounts } from '../draft/counts.js';
import { generateBibtexFromPapers, extractBibKeys } from '../draft/bib.js';
import { exportProjectDossier } from '../draft/export.js';

export class DraftEditorTabComponent {
  constructor(options = {}) {
    this.onDraftAudited = options.onDraftAudited;

    // Elements
    this.cmContainer = $('#codeMirrorContainer');
    this.titleInput = $('#draftDocTitle');
    this.saveIndicator = $('#draftSaveIndicator');
    this.wordCountBadge = $('#draftWordCountBadge');
    this.charCountBadge = $('#draftCharCountBadge');
    this.bibChip = $('#draftBibChip');
    this.compileStatusChip = $('#draftCompileStatusChip');
    this.paperDocClassSelect = $('#draftPaperDocClass');
    this.paperSizeSelect = $('#draftPaperSize');
    this.btnInsertOutline = $('#btnInsertOutlineSkeleton');
    this.btnCompile = $('#btnCompileDraftReview');
    this.btnToggleTerminal = $('#btnToggleTerminal');
    this.btnLoadTemplate = $('#btnLoadLatexTemplate');
    this.btnConvertToolbar = $('#btnConvertMarkdownToolbar');

    // Split & Resizer
    this.splitBody = $('#studioSplitBody');
    this.splitResizer = $('#studioSplitResizer');
    this.editorPane = $('#editorSplitPane');
    this.previewPane = $('#previewSplitPane');

    // Markdown Banner
    this.markdownBanner = $('#draftMarkdownBanner');
    this.btnConvertBanner = $('#btnConvertBannerAction');
    this.btnCompileAnyway = $('#btnCompileAnywayBannerAction');
    this.btnDismissBanner = $('#btnDismissBannerAction');

    // Preview Controls
    this.compiledView = $('#latexCompiledView');
    this.btnZoomIn = $('#btnPdfZoomIn');
    this.btnZoomOut = $('#btnPdfZoomOut');
    this.zoomLabel = $('#pdfZoomLabel');
    this.btnDownloadPdf = $('#btnDownloadPdf');
    this.pdfStandardLabel = $('#pdfStandardLabel');

    // Terminal Drawer
    this.terminalDrawer = $('#studioTerminalDrawer');
    this.terminalTabs = $$('.terminal-tab-btn');
    this.termProblemsCount = $('#termProblemsCount');
    this.termHealthScoreBadge = $('#termHealthScoreBadge');
    this.termProblemsList = $('#termProblemsList');
    this.termLogOutput = $('#termLogOutput');
    this.termMetricHealth = $('#termMetricHealth');
    this.termMetricFRE = $('#termMetricFRE');
    this.termMetricFog = $('#termMetricFog');
    this.termMetricOverlap = $('#termMetricOverlap');
    this.btnMinimizeTerminal = $('#btnMinimizeTerminal');

    // Status Bar
    this.statusCursorPos = $('#editorCursorPosition');
    this.statusSelLength = $('#editorSelectionLength');
    this.btnToggleWrap = $('#btnToggleWordWrap');
    this.btnHistory = $('#btnVersionHistory');
    this.btnShortcuts = $('#btnEditorShortcutsHelp');

    // Internal state
    this.currentProject = null;
    this.bibContent = '';
    this.availableBibKeys = [];
    this.currentErrors = [];
    this.autoCompileTimer = null;
    this.isAutoCompileEnabled = false;

    // Sub-controllers
    this.autosave = new AutoSaveManager({
      saveIndicator: this.saveIndicator,
      debounceMs: 800,
      onSave: () => this.executeSave()
    });

    this.compiler = new CompileManager({
      previewContainer: this.compiledView,
      compileBtn: this.btnCompile,
      compileStatusChip: this.compileStatusChip,
      onLog: (msg) => this.logToTerminal(msg)
    });

    this.init();
  }

  init() {
    this.initEditor();
    this.setupSplitResizer();
    this.setupToolbarActions();
    this.setupTerminalEvents();
    this.setupPdfControls();
    this.setupMarkdownBannerEvents();
    this.setupStatusBarEvents();
    this.setupExportListener();

    // Subscribe to store updates
    store.subscribe('currentProject', (project) => {
      if (project && (!this.currentProject || this.currentProject.id !== project.id)) {
        this.currentProject = project;
        this.autosave.setProjectId(project.id);
        this.loadProjectDraft(project.id);
        this.syncProjectBibtex(project.id);
      }
    });

    store.subscribe('papers', (papers) => {
      if (this.currentProject) {
        this.syncProjectBibtex(this.currentProject.id, papers);
      }
    });
  }

  initEditor() {
    if (!this.cmContainer) return;
    this.editor = new DraftCodeMirrorEditor(this.cmContainer, {
      initialValue: '',
      onCompile: () => this.compileDraft(),
      onSave: () => this.autosave.triggerSave(true),
      onChange: (val) => {
        this.updateCounts(val);
        this.autosave.markChanged();
        this.checkMarkdownDetection(val);
        if (this.isAutoCompileEnabled) {
          clearTimeout(this.autoCompileTimer);
          this.autoCompileTimer = setTimeout(() => this.compileDraft(true), 2000);
        }
      },
      onCursor: (pos) => {
        if (this.statusCursorPos) {
          this.statusCursorPos.textContent = `Ln ${pos.line}, Col ${pos.ch}`;
        }
        if (this.statusSelLength) {
          if (pos.selectionLength > 0) {
            this.statusSelLength.textContent = `${pos.selectionLength} sel`;
            this.statusSelLength.classList.remove('hidden');
          } else {
            this.statusSelLength.classList.add('hidden');
          }
        }
      }
    });
  }

  setupSplitResizer() {
    if (!this.splitResizer || !this.splitBody) return;

    let isDragging = false;

    // Restore saved width from localStorage
    const savedPct = localStorage.getItem('survey_split_pct');
    if (savedPct && this.editorPane && this.previewPane) {
      this.editorPane.style.flex = `0 0 ${savedPct}%`;
      this.previewPane.style.flex = `0 0 ${100 - parseFloat(savedPct)}%`;
    }

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const rect = this.splitBody.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const pct = Math.max(25, Math.min(75, (offsetX / rect.width) * 100));
      this.editorPane.style.flex = `0 0 ${pct}%`;
      this.previewPane.style.flex = `0 0 ${100 - pct}%`;
      localStorage.setItem('survey_split_pct', pct.toFixed(1));
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        this.splitResizer.classList.remove('resizing');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (this.editor && this.editor.cm) {
          this.editor.cm.refresh();
        }
      }
    };

    this.splitResizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      this.splitResizer.classList.add('resizing');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    this.splitResizer.addEventListener('dblclick', () => {
      this.editorPane.style.flex = '1 1 50%';
      this.previewPane.style.flex = '1 1 50%';
      localStorage.removeItem('survey_split_pct');
      if (this.editor && this.editor.cm) this.editor.cm.refresh();
    });
  }

  setupToolbarActions() {
    // Snippet buttons
    $$('.btn-latex-tool[data-latex]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const snippet = btn.getAttribute('data-latex');
        if (snippet && this.editor) {
          this.editor.insertSnippet(snippet);
        }
      });
    });

    // Load full template
    this.btnLoadTemplate?.addEventListener('click', () => {
      if (this.editor.getValue().trim().length > 0) {
        if (!confirm('Replace current document with the full IEEEtran survey paper template?')) {
          return;
        }
      }
      this.editor.setValue(IEEE_FULL_TEMPLATE);
      this.editor.cm.focus();
      showToast('Loaded IEEEtran LaTeX template', 'success');
      this.compileDraft();
    });

    // Insert Outline
    this.btnInsertOutline?.addEventListener('click', () => {
      const outline = store.getState('outline');
      const proj = this.currentProject || { name: 'Survey Paper', topic: 'Literature Review' };
      const generated = generateIeeeOutline(proj.name, proj.topic, outline?.sections || []);

      const currentVal = this.editor.getValue().trim();
      if (currentVal.length > 0) {
        const choice = prompt('Draft has content.\nType: "replace" to overwrite, "append" to append at cursor, or Cancel to abort.');
        if (!choice) return;
        if (choice.toLowerCase() === 'replace') {
          this.editor.setValue(generated);
        } else if (choice.toLowerCase() === 'append') {
          this.editor.cm.replaceSelection('\n' + generated + '\n');
        } else {
          return;
        }
      } else {
        this.editor.setValue(generated);
      }
      showToast('Inserted IEEE outline skeleton', 'success');
    });

    // Convert Markdown Toolbar button
    this.btnConvertToolbar?.addEventListener('click', () => {
      this.convertCurrentMarkdown();
    });

    // Compile Button
    this.btnCompile?.addEventListener('click', () => {
      this.compileDraft();
    });

    // Terminal Drawer Button
    this.btnToggleTerminal?.addEventListener('click', () => {
      this.terminalDrawer?.classList.toggle('hidden');
    });

    // Paper size change
    this.paperSizeSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      if (this.pdfStandardLabel) {
        this.pdfStandardLabel.textContent = val === 'a4' ? 'IEEE STANDARD A4' : 'IEEE STANDARD US LETTER';
      }
    });

    // Document class option
    this.paperDocClassSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      const current = this.editor.getValue();
      if (current.includes('\\documentclass')) {
        const updated = current.replace(/\\documentclass(?:\[[^\]]*\])?\{IEEEtran\}/, `\\documentclass[${val}]{IEEEtran}`);
        this.editor.setValue(updated);
      }
    });

    // Bib chip preview
    this.bibChip?.addEventListener('click', () => {
      this.showBibtexPreviewModal();
    });
  }

  setupMarkdownBannerEvents() {
    this.btnConvertBanner?.addEventListener('click', () => {
      this.convertCurrentMarkdown();
      this.markdownBanner?.classList.add('hidden');
    });

    this.btnCompileAnyway?.addEventListener('click', () => {
      this.markdownBanner?.classList.add('hidden');
      this.compileDraft(false, true);
    });

    this.btnDismissBanner?.addEventListener('click', () => {
      this.markdownBanner?.classList.add('hidden');
    });
  }

  checkMarkdownDetection(content) {
    if (isMarkdownContent(content)) {
      this.markdownBanner?.classList.remove('hidden');
    } else {
      this.markdownBanner?.classList.add('hidden');
    }
  }

  convertCurrentMarkdown() {
    if (!this.editor) return;
    const current = this.editor.getValue();
    if (!isMarkdownContent(current)) {
      showToast('Document is already in LaTeX format.', 'info');
      return;
    }

    const proj = this.currentProject || { name: 'Survey Paper', topic: 'Literature Review' };
    const converted = convertMarkdownToLatex(current, proj);

    // Apply as single operation for undo
    this.editor.cm.operation(() => {
      this.editor.cm.setValue(converted);
    });

    this.markdownBanner?.classList.add('hidden');
    showToast('Converted Markdown to IEEE LaTeX! (Ctrl+Z to undo)', 'success');
    this.compileDraft();
  }

  setupTerminalEvents() {
    this.terminalTabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const targetTab = tab.getAttribute('data-term-tab');
        this.switchTerminalTab(targetTab);
      });
    });

    this.btnMinimizeTerminal?.addEventListener('click', () => {
      this.terminalDrawer?.classList.add('hidden');
    });
  }

  switchTerminalTab(tabId) {
    this.terminalTabs.forEach((t) => {
      if (t.getAttribute('data-term-tab') === tabId) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });

    const panes = {
      termProblems: $('#termProblems'),
      termLog: $('#termLog'),
      termAudit: $('#termAudit')
    };

    Object.entries(panes).forEach(([id, pane]) => {
      if (pane) {
        pane.style.display = id === tabId ? 'block' : 'none';
      }
    });
  }

  setupPdfControls() {
    this.btnZoomIn?.addEventListener('click', () => {
      this.compiler.zoomIn();
      if (this.zoomLabel) {
        this.zoomLabel.textContent = `${Math.round(this.compiler.zoomScale * 100)}%`;
      }
    });

    this.btnZoomOut?.addEventListener('click', () => {
      this.compiler.zoomOut();
      if (this.zoomLabel) {
        this.zoomLabel.textContent = `${Math.round(this.compiler.zoomScale * 100)}%`;
      }
    });

    this.btnDownloadPdf?.addEventListener('click', () => {
      if (this.compiler.lastSuccessfulPdfData) {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${this.compiler.lastSuccessfulPdfData}`;
        link.download = `${this.titleInput?.value?.replace('.tex', '') || 'main'}.pdf`;
        link.click();
      } else {
        showToast('No compiled PDF available yet. Click "Audit & Compile Draft" first.', 'warning');
      }
    });
  }

  setupStatusBarEvents() {
    this.btnToggleWrap?.addEventListener('click', () => {
      if (this.editor && this.editor.cm) {
        const wrap = !this.editor.cm.getOption('lineWrapping');
        this.editor.cm.setOption('lineWrapping', wrap);
        this.btnToggleWrap.textContent = `Wrap: ${wrap ? 'On' : 'Off'}`;
      }
    });

    this.btnHistory?.addEventListener('click', () => {
      if (!this.currentProject) return;
      const history = this.autosave.getHistory(this.currentProject.id);
      if (history.length === 0) {
        showToast('No previous autosaves found for this project.', 'info');
        return;
      }

      const listStr = history.map((h, i) => `${i + 1}. ${h.timeLabel} (${h.content.length} chars)`).join('\n');
      const pick = prompt(`Version History (Autosaves):\n${listStr}\n\nEnter number (1-${history.length}) to restore:`);
      if (pick) {
        const idx = parseInt(pick, 10) - 1;
        if (history[idx]) {
          this.editor.setValue(history[idx].content);
          showToast(`Restored snapshot from ${history[idx].timeLabel}`, 'success');
        }
      }
    });

    this.btnShortcuts?.addEventListener('click', () => {
      alert(
        'LaTeX Studio Keyboard Shortcuts:\n\n' +
        '• Ctrl+Enter: Audit & Compile Draft\n' +
        '• Ctrl+S: Save Draft\n' +
        '• Ctrl+Space: Autocomplete (LaTeX commands & \\cite keys)\n' +
        '• Tab: Indent / 2 spaces\n' +
        '• Ctrl+Z / Ctrl+Y: Undo / Redo\n' +
        '• Click a Problem to jump directly to the line'
      );
    });
  }

  setupExportListener() {
    const exportBtn = $('#btnExportProject');
    exportBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!this.currentProject) return;

      const tex = this.editor ? this.editor.getValue() : '';
      const bib = this.bibContent;
      const pdf = this.compiler.lastSuccessfulPdfData;

      showToast('Packaging Survey Dossier zip…', 'info');
      await exportProjectDossier(this.currentProject, tex, bib, pdf);
      showToast('Export Dossier downloaded!', 'success');
    });
  }

  async syncProjectBibtex(projectId, papersList = null) {
    try {
      const papers = papersList || (await api.getPapers(projectId)) || [];
      this.bibContent = generateBibtexFromPapers(papers);
      this.availableBibKeys = extractBibKeys(this.bibContent);

      if (this.bibChip) {
        this.bibChip.textContent = `references.bib · ${papers.length} entries`;
      }

      if (this.editor) {
        this.editor.setBibPapers(papers);
      }
    } catch (e) {
      console.warn('Could not sync bibtex', e);
    }
  }

  showBibtexPreviewModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal-card" style="max-width: 650px;">
        <div class="modal-header">
          <h3>references.bib Preview</h3>
          <button type="button" class="btn-icon" id="btnCloseBibModal">✕</button>
        </div>
        <div class="modal-body">
          <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Auto-generated from your Literature Papers list. Used during LaTeX compilation.</p>
          <pre class="bibtex-preview-box">${escapeHtml(this.bibContent || '% No entries found. Upload papers in the Literature Papers tab.')}</pre>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline btn-sm" id="btnCopyBib">Copy BibTeX</button>
          <button type="button" class="btn btn-primary btn-sm" id="btnOkBib">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#btnCloseBibModal')?.addEventListener('click', close);
    modal.querySelector('#btnOkBib')?.addEventListener('click', close);
    modal.querySelector('#btnCopyBib')?.addEventListener('click', () => {
      navigator.clipboard.writeText(this.bibContent);
      showToast('BibTeX copied to clipboard!', 'success');
    });
  }

  updateCounts(val) {
    const stats = calculateLatexCounts(val);
    if (this.wordCountBadge) {
      this.wordCountBadge.textContent = `~${stats.words} words`;
      this.wordCountBadge.title = `~${stats.words} words (~${stats.readTimeMinutes} min read, excl. LaTeX)`;
    }
    if (this.charCountBadge) {
      this.charCountBadge.textContent = `${stats.chars} chars`;
    }
  }

  async loadProjectDraft(projectId) {
    try {
      const draft = await api.getDraft(projectId);
      if (draft) {
        if (this.titleInput) this.titleInput.value = draft.title || 'main.tex';
        const content = draft.content || '';
        if (this.editor) {
          this.editor.setValue(content);
        }
        this.updateCounts(content);
        this.checkMarkdownDetection(content);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async executeSave() {
    if (!this.currentProject) return null;
    const title = this.titleInput?.value?.trim() || 'main.tex';
    const content = this.editor ? this.editor.getValue() : '';
    const isMd = isMarkdownContent(content);

    const data = {
      title,
      content,
      format: isMd ? 'markdown' : 'latex',
      schema_version: 1,
      legacy_markdown: isMd ? content : ''
    };

    return await api.saveDraft(this.currentProject.id, data);
  }

  async compileDraft(isBackground = false, forceMarkdown = false) {
    if (!this.currentProject) {
      showToast('Select a project first', 'warning');
      return;
    }

    const tex = this.editor ? this.editor.getValue().trim() : '';
    if (!tex) {
      showToast('Editor is empty.', 'warning');
      return;
    }

    if (!forceMarkdown && isMarkdownContent(tex)) {
      this.markdownBanner?.classList.remove('hidden');
      showToast('Detected Markdown. Please convert to LaTeX to compile.', 'warning');
      return;
    }

    // 1. Run client-side pre-compile audit (never blocking)
    const preWarnings = runClientPreCompileAudit(tex, this.availableBibKeys);

    // Open terminal drawer and switch to Problems
    if (!isBackground) {
      this.terminalDrawer?.classList.remove('hidden');
      this.switchTerminalTab('termProblems');
    }

    this.logToTerminal(`[${new Date().toLocaleTimeString()}] ▶ Compiling LaTeX for "${this.titleInput?.value || 'main.tex'}"...`);

    // Auto-save first
    await this.autosave.triggerSave(true);

    try {
      const paperSize = this.paperSizeSelect?.value || 'letter';
      const result = await this.compiler.compile({
        projectId: this.currentProject.id,
        latexSrc: tex,
        docTitle: this.titleInput?.value || 'main.tex',
        bibSrc: this.bibContent,
        paperSize,
        onAuditComplete: (res) => this.handleAuditResults(res, preWarnings)
      });

      if (result && result.log) {
        this.renderLog(result.log);
      }

      if (this.onDraftAudited) {
        this.onDraftAudited();
      }
    } catch (err) {
      this.logToTerminal(`[${new Date().toLocaleTimeString()}] ✕ Compilation error: ${err.message}`);
      showToast(`Compile error: ${err.message}`, 'error');
    }
  }

  handleAuditResults(result, preWarnings = []) {
    const health = result.health_score || 0;

    // Update health badges
    if (this.termHealthScoreBadge) {
      this.termHealthScoreBadge.textContent = `Health: ${health}/100`;
      this.termHealthScoreBadge.style.color = health >= 75 ? 'var(--success)' : health >= 50 ? 'var(--warning)' : 'var(--critical)';
    }

    if (this.termMetricHealth) this.termMetricHealth.textContent = `${health}/100`;
    if (this.termMetricFRE) this.termMetricFRE.textContent = `${result.readability?.flesch_reading_ease ?? '--'}`;
    if (this.termMetricFog) this.termMetricFog.textContent = `${result.readability?.gunning_fog ?? '--'} (${result.readability?.grade_level ?? ''})`;
    if (this.termMetricOverlap) this.termMetricOverlap.textContent = `${result.overlap?.overall_overlap_pct ?? 0}% (${result.overlap?.risk_level ?? 'Clean'})`;

    // Merge backend errors/warnings with client pre-compile warnings
    const combinedIssues = [...(result.errors || []), ...(result.warnings || []), ...preWarnings];
    this.renderProblems(combinedIssues);

    if (this.editor) {
      this.editor.applyErrorMarkers(result.errors || []);
    }
  }

  renderProblems(issues = []) {
    if (!this.termProblemsList) return;
    this.currentErrors = issues;

    if (this.termProblemsCount) {
      this.termProblemsCount.textContent = issues.length;
      this.termProblemsCount.style.background = issues.some((i) => i.severity === 'error') ? '#ef4444' : '#64748b';
    }

    if (issues.length === 0) {
      this.termProblemsList.innerHTML = `
        <div class="term-empty-message" style="color:var(--success);">
          ✓ No LaTeX syntax or bibliography problems detected.
        </div>
      `;
      return;
    }

    const items = issues.map((iss, idx) => {
      const isErr = iss.severity === 'error' || iss.severity === 'critical';
      const icon = isErr ? '✕' : '⚠';
      const color = isErr ? '#ef4444' : '#f59e0b';
      const lineText = iss.line ? `Line ${iss.line}: ` : '';

      return `
        <div class="problem-item" data-line="${iss.line || ''}" style="cursor:pointer;padding:6px 12px;border-bottom:1px solid rgba(0,0,0,0.05);display:flex;align-items:center;gap:10px;font-size:12px;">
          <span style="color:${color};font-weight:bold;">${icon}</span>
          <span style="flex:1;"><strong>${lineText}</strong>${escapeHtml(iss.message || iss.description || 'Syntax warning')}</span>
          ${iss.line ? `<span style="color:#94a3b8;font-size:11px;">Jump →</span>` : ''}
        </div>
      `;
    }).join('');

    this.termProblemsList.innerHTML = items;

    // Attach click jump events
    this.termProblemsList.querySelectorAll('.problem-item').forEach((el) => {
      el.addEventListener('click', () => {
        const line = parseInt(el.getAttribute('data-line'), 10);
        if (line && this.editor) {
          this.editor.jumpToLine(line);
        }
      });
    });
  }

  renderLog(logText) {
    if (!this.termLogOutput) return;
    const lines = logText.split('\n');
    const htmlLines = lines.map((l) => {
      if (l.includes('error') || l.startsWith('!')) {
        return `<div class="console-line" style="color:#f87171;">${escapeHtml(l)}</div>`;
      } else if (l.includes('Warning')) {
        return `<div class="console-line" style="color:#fbbf24;">${escapeHtml(l)}</div>`;
      } else {
        return `<div class="console-line log-dim">${escapeHtml(l)}</div>`;
      }
    }).join('');

    this.termLogOutput.innerHTML = htmlLines;
  }

  logToTerminal(msg) {
    if (!this.termLogOutput) return;
    const div = document.createElement('div');
    div.className = 'console-line log-info';
    div.textContent = msg;
    this.termLogOutput.appendChild(div);
  }
}
