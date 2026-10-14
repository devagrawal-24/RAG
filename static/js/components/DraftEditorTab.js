// DraftEditorTab.js — LaTeX Draft Studio IDE
// Features:
//   • Monaco-style line-number gutter  
//   • Full LaTeX toolbar (snippets, template loader)
//   • "Audit & Compile Draft" → calls /draft/compile, renders HTML preview in terminal
//   • Bottom diagnostics terminal: Compiled Preview | Problems | Metrics | Console
//   • Side-docked AI Co-Pilot with @-mention support

import { $, $$ } from '../utils/dom.js';
import { escapeHtml, formatMarkdown } from '../utils/formatters.js';
import { showToast } from '../utils/toast.js';
import { api } from '../api.js';
import { store } from '../state.js';
import { MentionPopover } from './MentionPopover.js';

// ---------------------------------------------------------------------------
// LaTeX snippet library
// ---------------------------------------------------------------------------
const LATEX_SNIPPETS = {
  section:     '\\section{Section Title}\n',
  subsection:  '\\subsection{Subsection Title}\n',
  subsubsection: '\\subsubsection{Sub-subsection Title}\n',
  textbf:      '\\textbf{bold text}',
  textit:      '\\textit{italic text}',
  emph:        '\\emph{emphasized text}',
  texttt:      '\\texttt{code or monospace}',
  underline:   '\\underline{underlined text}',
  itemize: (
    '\\begin{itemize}\n' +
    '  \\item First item\n' +
    '  \\item Second item\n' +
    '  \\item Third item\n' +
    '\\end{itemize}\n'
  ),
  enumerate: (
    '\\begin{enumerate}\n' +
    '  \\item First item\n' +
    '  \\item Second item\n' +
    '  \\item Third item\n' +
    '\\end{enumerate}\n'
  ),
  table: (
    '\\begin{table}[h]\n' +
    '  \\centering\n' +
    '  \\caption{Table Caption}\n' +
    '  \\label{tab:label}\n' +
    '  \\begin{tabular}{|l|c|r|}\n' +
    '    \\hline\n' +
    '    Column 1 & Column 2 & Column 3 \\\\\\\\\n' +
    '    \\hline\n' +
    '    Row 1    & Value    & Value    \\\\\\\\\n' +
    '    Row 2    & Value    & Value    \\\\\\\\\n' +
    '    \\hline\n' +
    '  \\end{tabular}\n' +
    '\\end{table}\n'
  ),
  equation: (
    '\\begin{equation}\n' +
    '  \\label{eq:label}\n' +
    '  f(x) = \\sum_{i=0}^{n} a_i x^i\n' +
    '\\end{equation}\n'
  ),
  align: (
    '\\begin{align}\n' +
    '  a &= b + c \\\\\\\\\n' +
    '  d &= e + f\n' +
    '\\end{align}\n'
  ),
  cite:    '\\cite{key}',
  ref:     '\\ref{label}',
  label:   '\\label{sec:label}',
  figure: (
    '\\begin{figure}[h]\n' +
    '  \\centering\n' +
    '  \\includegraphics[width=0.8\\textwidth]{figure.png}\n' +
    '  \\caption{Figure Caption}\n' +
    '  \\label{fig:label}\n' +
    '\\end{figure}\n'
  ),
  abstract: (
    '\\begin{abstract}\n' +
    '  Your abstract goes here. Summarize the paper\'s motivation, methodology, and contributions.\n' +
    '\\end{abstract}\n'
  ),
};

const LATEX_FULL_TEMPLATE = `\\documentclass[10pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{cite}
\\usepackage{geometry}
\\geometry{margin=1in}
\\usepackage{booktabs}
\\usepackage{enumitem}

\\title{Survey Title: A Comprehensive Review of [Topic]}
\\author{Author Name\\\\
  \\textit{Institution / Department}\\\\
  \\texttt{author@email.com}}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
This paper presents a comprehensive survey of [topic]. We analyze [N] peer-reviewed works spanning [year range], synthesizing methodological advances, empirical benchmarks, and open research challenges. Our taxonomy organizes existing approaches into [X] major categories and identifies [key gap] as a priority for future investigation.
\\end{abstract}

\\section{Introduction}
The field of [topic] has grown significantly since [year]. Motivated by [challenge], researchers have proposed numerous approaches to address [problem]. This survey provides a structured synthesis of the current state-of-the-art, with the following contributions:

\\begin{enumerate}
  \\item A taxonomy of existing approaches across [X] dimensions.
  \\item A comparative analysis of empirical results on benchmark datasets.
  \\item An identification of open challenges and future directions.
\\end{enumerate}

\\section{Background and Related Work}
\\subsection{Foundational Concepts}
[Introduce key background concepts and terminology here.]

\\subsection{Prior Surveys}
Several surveys have addressed related aspects of this domain \\cite{ref1, ref2}. However, [gap this paper fills].

\\section{Taxonomy and Methodology Classification}
\\subsection{Category 1: [Name]}
[Description of category 1 approaches and representative papers.]

\\subsection{Category 2: [Name]}
[Description of category 2 approaches and representative papers.]

\\section{Comparative Analysis}
\\begin{table}[h]
  \\centering
  \\caption{Comparison of representative approaches across key metrics.}
  \\label{tab:comparison}
  \\begin{tabular}{|l|c|c|c|}
    \\hline
    Method & Metric 1 & Metric 2 & Complexity \\\\
    \\hline
    Method A \\cite{ref1} & 0.92 & 0.87 & $O(n)$ \\\\
    Method B \\cite{ref2} & 0.89 & 0.91 & $O(n \\log n)$ \\\\
    Method C \\cite{ref3} & 0.95 & 0.88 & $O(n^2)$ \\\\
    \\hline
  \\end{tabular}
\\end{table}

\\section{Open Challenges and Future Directions}
Despite significant progress, several challenges remain unresolved:

\\begin{itemize}
  \\item \\textbf{Challenge 1:} [Description and why it matters.]
  \\item \\textbf{Challenge 2:} [Description and why it matters.]
  \\item \\textbf{Challenge 3:} [Description and why it matters.]
\\end{itemize}

Future research directions include [directions].

\\section{Conclusion}
This survey systematically reviewed [topic], covering [N] papers from [year range]. We presented a taxonomy of [X] categories, a comparative benchmark analysis, and highlighted open challenges. We hope this synthesis provides a useful foundation for both newcomers and experienced practitioners advancing the field.

\\begin{thebibliography}{99}
  \\bibitem{ref1} Author A, Author B. \\textit{Title of Paper One}. In: \\textit{Conference Name}, 2023.
  \\bibitem{ref2} Author C. \\textit{Title of Paper Two}. \\textit{Journal Name}, vol. 10, pp. 1--15, 2022.
  \\bibitem{ref3} Author D, Author E, Author F. \\textit{Title of Paper Three}. arXiv preprint arXiv:XXXX.XXXXX, 2024.
\\end{thebibliography}

\\end{document}
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export class DraftEditorTabComponent {
  constructor({ onDraftAudited }) {
    this.onDraftAudited = onDraftAudited;

    // Editor elements
    this.textarea   = $('#draftEditorTextarea');
    this.gutter     = $('#editorLineNumbers');
    this.titleInput = $('#draftDocTitle');
    this.saveIndicator  = $('#draftSaveIndicator');
    this.wordCountBadge = $('#draftWordCountBadge');
    this.charCountBadge = $('#draftCharCountBadge');
    this.btnInsertOutline = $('#btnInsertOutlineSkeleton');
    this.btnCompile       = $('#btnCompileDraftReview');
    this.btnToggleTerminal = $('#btnToggleTerminal');
    this.btnLoadTemplate   = $('#btnLoadLatexTemplate');

    // Terminal Drawer elements
    this.terminalDrawer      = $('#studioTerminalDrawer');
    this.terminalTabs        = $$('.terminal-tab-btn');
    this.terminalPanes       = $$('.term-tab-pane');
    this.termProblemsCount   = $('#termProblemsCount');
    this.termHealthScoreBadge = $('#termHealthScoreBadge');
    this.termProblemsList    = $('#termProblemsList');
    this.termMetricHealth    = $('#termMetricHealth');
    this.termMetricFRE       = $('#termMetricFRE');
    this.termMetricFog       = $('#termMetricFog');
    this.termMetricOverlap   = $('#termMetricOverlap');
    this.termConsoleOutput   = $('#termConsoleOutput');
    this.termCompiledView    = $('#latexCompiledView');
    this.btnMinimizeTerminal = $('#btnMinimizeTerminal');

    // Docked Live Chat elements
    this.dockedChatMessages = $('#dockedChatMessages');
    this.dockedChatForm     = $('#dockedChatForm');
    this.dockedChatInput    = $('#dockedChatInput');
    this.dockedChips        = $$('.docked-chip');

    this.saveTimer = null;
    this.isCompiling = false;
    this.isWaitingResponse = false;

    this.init();
  }

  init() {
    this.setupEditorEvents();
    this.setupLatexToolbar();
    this.setupTerminalEvents();
    this.setupDockedChat();

    store.subscribe('currentProject', (project) => {
      if (project) this.loadProjectDraft(project.id);
    });

    store.subscribe('chatMessages', (messages) => {
      if (!this.isWaitingResponse) {
        this.renderDockedChat(messages || []);
      }
    });
  }

  // =========================================================================
  // Editor events
  // =========================================================================
  setupEditorEvents() {
    if (!this.textarea) return;

    this.textarea.addEventListener('input', () => {
      this.updateGutter();
      this.updateWordStats();
      this.queueAutoSave();
    });

    this.textarea.addEventListener('scroll', () => {
      if (this.gutter) this.gutter.scrollTop = this.textarea.scrollTop;
    });

    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.textarea.selectionStart;
        const end   = this.textarea.selectionEnd;
        this.textarea.value =
          this.textarea.value.substring(0, start) + '  ' +
          this.textarea.value.substring(end);
        this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;
        this.updateGutter();
        this.queueAutoSave();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.compileAndAudit();
      } else if (e.key === 'Backslash' || e.key === '\\') {
        // Show autocomplete hint in future — for now just pass through
      }
    });

    this.titleInput?.addEventListener('input', () => this.queueAutoSave());

    this.btnInsertOutline?.addEventListener('click', (e) => {
      e?.preventDefault();
      this.insertLatexOutlineSkeleton();
    });

    this.btnCompile?.addEventListener('click', (e) => {
      e?.preventDefault();
      this.compileAndAudit();
    });

    this.btnToggleTerminal?.addEventListener('click', (e) => {
      e?.preventDefault();
      this.terminalDrawer?.classList.toggle('hidden');
    });
  }

  // =========================================================================
  // LaTeX toolbar
  // =========================================================================
  setupLatexToolbar() {
    // Snippet buttons (data-latex attribute)
    $$('.btn-latex-tool[data-latex]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const key = btn.dataset.latex;
        const snippet = LATEX_SNIPPETS[key];
        if (snippet) this.insertSnippet(snippet);
      });
    });

    // Load full template
    this.btnLoadTemplate?.addEventListener('click', (e) => {
      e.preventDefault();
      const hasContent = this.textarea?.value?.trim();
      if (hasContent && !confirm('Load the full LaTeX survey template? Your current content will be replaced.')) {
        return;
      }
      if (this.textarea) {
        this.textarea.value = LATEX_FULL_TEMPLATE;
        this.updateGutter();
        this.updateWordStats();
        this.queueAutoSave();
        showToast('LaTeX survey template loaded!', 'success');
      }
    });
  }

  insertSnippet(snippet) {
    if (!this.textarea) return;
    const start = this.textarea.selectionStart;
    const end   = this.textarea.selectionEnd;
    const before = this.textarea.value.substring(0, start);
    const after  = this.textarea.value.substring(end);
    this.textarea.value = before + snippet + after;
    const newPos = start + snippet.length;
    this.textarea.selectionStart = this.textarea.selectionEnd = newPos;
    this.textarea.focus();
    this.updateGutter();
    this.updateWordStats();
    this.queueAutoSave();
  }

  // =========================================================================
  // Terminal tab events
  // =========================================================================
  setupTerminalEvents() {
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

    this.btnMinimizeTerminal?.addEventListener('click', (e) => {
      e?.preventDefault();
      this.terminalDrawer?.classList.add('hidden');
    });
  }

  // =========================================================================
  // Gutter & stats
  // =========================================================================
  updateGutter() {
    if (!this.textarea || !this.gutter) return;
    const lines = this.textarea.value.split('\n').length;
    let html = '';
    for (let i = 1; i <= lines; i++) html += `<div>${i}</div>`;
    this.gutter.innerHTML = html;
  }

  updateWordStats() {
    const text  = this.textarea?.value || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const readMins = Math.max(1, Math.ceil(words / 200));
    if (this.wordCountBadge)
      this.wordCountBadge.textContent = `${words} words (~${readMins} min read)`;
    if (this.charCountBadge)
      this.charCountBadge.textContent = `${chars} chars`;
  }

  // =========================================================================
  // Auto-save
  // =========================================================================
  queueAutoSave() {
    if (this.saveIndicator) {
      this.saveIndicator.innerHTML = `<span class="spin-dot"></span> Saving...`;
      this.saveIndicator.classList.add('saving');
    }
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveDraft(), 1200);
  }

  async saveDraft() {
    const project = store.getState('currentProject');
    if (!project) return;
    const title   = this.titleInput?.value?.trim() || 'survey_paper.tex';
    const content = this.textarea?.value || '';
    try {
      await api.saveDraft(project.id, { title, content });
      if (this.saveIndicator) {
        this.saveIndicator.innerHTML = `<span class="pulse-dot"></span> Saved`;
        this.saveIndicator.classList.remove('saving');
      }
    } catch (err) {
      if (this.saveIndicator) this.saveIndicator.innerHTML = `⚠️ Save error`;
    }
  }

  async loadProjectDraft(projectId) {
    try {
      const draft = await api.getDraft(projectId);
      if (draft) {
        if (this.titleInput) this.titleInput.value = draft.title || 'survey_paper.tex';
        if (this.textarea)   this.textarea.value   = draft.content || '';
        this.updateGutter();
        this.updateWordStats();
      }
    } catch (err) {
      console.error(err);
    }
  }

  // =========================================================================
  // Insert LaTeX outline skeleton from generated Outline
  // =========================================================================
  insertLatexOutlineSkeleton() {
    const outline = store.getState('outline');
    const project = store.getState('currentProject');
    const sections = outline?.sections || [];

    if (sections.length === 0) {
      showToast('No outline generated yet. Generate an outline first, or use "Load LaTeX Template".', 'warning');
      return;
    }

    if (this.textarea.value.trim() &&
        !confirm('Insert LaTeX outline skeleton? Your existing draft will be saved first.')) {
      return;
    }

    const title  = project?.name || 'Survey Paper';
    const topic  = project?.topic || 'Academic Literature Review';

    const lines = [
      `\\documentclass[10pt,a4paper]{article}`,
      `\\usepackage[utf8]{inputenc}`,
      `\\usepackage{amsmath,amssymb,graphicx,hyperref,cite,geometry}`,
      `\\geometry{margin=1in}`,
      ``,
      `\\title{${title}}`,
      `\\author{Your Name}`,
      `\\date{\\today}`,
      ``,
      `\\begin{document}`,
      `\\maketitle`,
      ``,
      `\\begin{abstract}`,
      `This survey synthesizes current methodologies, empirical findings, and foundational gaps across the ${topic} literature.`,
      `\\end{abstract}`,
      ``,
    ];

    sections.forEach(s => {
      const cites = (s.suggested_citations || []).join(', ');
      const citeNote = cites ? `\n% Suggested citations: ${cites}` : '';
      lines.push(`\\section{${s.number} ${s.title}}${citeNote}`);
      if (s.description) lines.push(`% ${s.description}`);
      lines.push(`% TODO: Synthesize claims and compare approaches here`);
      lines.push(``);
    });

    lines.push(`\\begin{thebibliography}{99}`);
    lines.push(`  % Add \\bibitem entries here`);
    lines.push(`\\end{thebibliography}`);
    lines.push(``);
    lines.push(`\\end{document}`);

    this.textarea.value = lines.join('\n');
    this.updateGutter();
    this.updateWordStats();
    this.queueAutoSave();
    showToast('LaTeX outline skeleton inserted!', 'success');
  }

  // =========================================================================
  // Compile & Audit (main action)
  // =========================================================================
  async compileAndAudit() {
    const project = store.getState('currentProject');
    if (!project) return;

    const latexSrc   = this.textarea?.value?.trim();
    const draftTitle = this.titleInput?.value?.trim() || 'survey_paper.tex';

    if (!latexSrc || latexSrc.split(/\s+/).length < 10) {
      showToast('Please write some LaTeX content before compiling (min 10 words).', 'warning');
      return;
    }

    if (this.isCompiling) return;
    this.isCompiling = true;

    // Open terminal drawer, switch to Console tab first
    this.terminalDrawer?.classList.remove('hidden');
    this.switchTerminalTab('termConsole');

    const btn = this.btnCompile;
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.innerHTML = `<span class="spin-dot" style="border-top-color:white;"></span> Compiling...`;
      btn.disabled = true;
    }

    this.logConsole(`[${new Date().toLocaleTimeString()}] ▶ Starting LaTeX compilation: "${draftTitle}"...`);
    this.logConsole(`[${new Date().toLocaleTimeString()}] Parsing LaTeX source (${latexSrc.split(/\s+/).length} tokens)...`);
    this.logConsole(`[${new Date().toLocaleTimeString()}] Converting LaTeX → HTML preview...`);

    // Auto-save first
    await this.saveDraft();

    try {
      const result = await api.compileDraft(project.id, latexSrc, draftTitle);
      this.isCompiling = false;
      if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }

      const health = result.health_score || 0;

      this.logConsole(`[${new Date().toLocaleTimeString()}] ✓ Compilation complete. Health score: ${health}/100`);
      this.logConsole(`[${new Date().toLocaleTimeString()}] Readability: Flesch ${result.readability?.flesch_reading_ease ?? '--'}, Fog ${result.readability?.gunning_fog ?? '--'}`);
      this.logConsole(`[${new Date().toLocaleTimeString()}] Literature overlap: ${result.overlap?.overall_overlap_pct ?? 0}% (${result.overlap?.risk_level ?? 'Clean'})`);

      if (result.warnings?.length) {
        result.warnings.forEach(w => this.logConsole(`[WARN] ${w}`));
      }

      // Render compiled PDF preview
      this.renderCompiledPreview(result.html, result.meta, result.pdf_pages || []);

      // Update health badge
      if (this.termHealthScoreBadge) {
        this.termHealthScoreBadge.textContent = `Health: ${health}/100`;
        this.termHealthScoreBadge.style.color = health >= 75
          ? 'var(--success)' : health >= 50 ? 'var(--warning)' : 'var(--critical)';
      }

      // Populate Metrics tab
      if (this.termMetricHealth)  this.termMetricHealth.textContent  = `${health}/100`;
      if (this.termMetricFRE)     this.termMetricFRE.textContent     = `${result.readability?.flesch_reading_ease ?? '--'}`;
      if (this.termMetricFog)     this.termMetricFog.textContent     = `${result.readability?.gunning_fog ?? '--'} (${result.readability?.grade_level ?? ''})`;
      if (this.termMetricOverlap) this.termMetricOverlap.textContent = `${result.overlap?.overall_overlap_pct ?? 0}% (${result.overlap?.risk_level ?? 'Clean'})`;

      // Populate Problems tab
      this.renderProblems(result.issues || []);

      showToast(`Compiled! Health: ${health}/100`, health >= 70 ? 'success' : 'info');
      this.onDraftAudited?.();

      // Switch to compiled preview tab after short delay
      setTimeout(() => this.switchTerminalTab('termCompiledOutput'), 400);

      // If problems, switch to problems after preview display
      if ((result.issues || []).filter(i => i.severity === 'critical').length > 0) {
        setTimeout(() => this.switchTerminalTab('termProblems'), 1800);
      }
    } catch (err) {
      this.isCompiling = false;
      if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
      this.logConsole(`[${new Date().toLocaleTimeString()}] ✕ Compilation failed: ${err.message}`);
      showToast(`Compilation failed: ${err.message}`, 'error');
    }
  }

  // =========================================================================
  // Render compiled LaTeX PDF preview
  // =========================================================================
  renderCompiledPreview(htmlContent, meta, pdfPages = []) {
    if (!this.termCompiledView) return;

    const docTitle = meta?.title || this.titleInput?.value || 'Untitled Document';
    const safeTitle = escapeHtml(docTitle);
    const pageCount = pdfPages.length || 1;

    let paperHtml = '';
    if (pdfPages && pdfPages.length > 0) {
      // High-fidelity rendered PDF pages from PyMuPDF
      const pagesHtml = pdfPages.map((pageUrl, idx) => `
        <div class="latex-pdf-page-card">
          <div style="width:100%;display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:11px;color:#999;font-family:'Inter',sans-serif;">
            <span>Page ${idx + 1} of ${pageCount}</span>
            <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#777;">IEEE Standard A4</span>
          </div>
          <img class="latex-pdf-page-sheet" src="${pageUrl}" alt="Compiled Draft Page ${idx + 1}" />
        </div>
      `).join('');

      paperHtml = `
        <div class="latex-pdf-pages-container">
          ${pagesHtml}
        </div>
      `;
    } else {
      // Clean HTML fallback
      paperHtml = `
        <div id="latexRenderedPaper">
          ${htmlContent}
        </div>
      `;
    }

    this.termCompiledView.innerHTML = `
      <div class="latex-preview-wrapper">
        <div class="latex-preview-toolbar">
          <span class="latex-preview-label">
            <!-- PDF icon -->
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            ${safeTitle}
          </span>
          <div style="display:flex;align-items:center;gap:12px;">
            <span style="font-size:11px;color:#aaa;font-family:'Inter',sans-serif;">${pageCount} Page${pageCount > 1 ? 's' : ''}</span>
            <span class="latex-preview-badge">Compiled PDF</span>
          </div>
        </div>
        <div class="latex-preview-paper">
          ${paperHtml}
        </div>
      </div>
    `;

    // Trigger KaTeX render if using HTML fallback
    const paper = document.getElementById('latexRenderedPaper');
    if (paper && window.renderMathInElement) {
      try {
        window.renderMathInElement(paper, {
          delimiters: [
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false },
          ],
          throwOnError: false,
        });
      } catch (e) { /* KaTeX not available */ }
    }
  }

  // =========================================================================
  // Problems renderer
  // =========================================================================
  renderProblems(issues = []) {
    if (!this.termProblemsList) return;
    if (this.termProblemsCount) this.termProblemsCount.textContent = issues.length;

    this.termProblemsList.innerHTML = '';

    if (issues.length === 0) {
      this.termProblemsList.innerHTML = `
        <div class="term-clean-state">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>Zero critical problems detected! Your LaTeX draft passes structural, citation, and readability audits.</span>
        </div>
      `;
      return;
    }

    issues.forEach(iss => {
      const item = document.createElement('div');
      item.className = `term-problem-item severity-${iss.severity}`;
      const badgeClass = iss.severity === 'critical'
        ? 'badge-critical' : iss.severity === 'warning' ? 'badge-warning' : 'badge-info';
      item.innerHTML = `
        <div class="term-problem-header">
          <span class="badge ${badgeClass}">${iss.severity.toUpperCase()}</span>
          <strong class="term-problem-title">${escapeHtml(iss.title)}</strong>
          <span class="term-problem-loc">${escapeHtml(iss.location || 'Draft')}</span>
        </div>
        <div class="term-problem-desc">${escapeHtml(iss.description)}</div>
        <div class="term-problem-fix">
          <span class="fix-label">Suggested fix:</span> ${escapeHtml(iss.suggestion || 'Revise.')}
        </div>
      `;
      this.termProblemsList.appendChild(item);
    });
  }

  // =========================================================================
  // Console log helper
  // =========================================================================
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

  // =========================================================================
  // Docked Live Co-Pilot Chat
  // =========================================================================
  setupDockedChat() {
    if (this.dockedChatInput) {
      this.mentionPopover = new MentionPopover(this.dockedChatInput);
    }
    this.dockedChatForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = this.dockedChatInput?.value?.trim();
      if (text) this.sendDockedMessage(text);
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

  renderDockedChat(messages = []) {
    if (!this.dockedChatMessages) return;
    this.dockedChatMessages.innerHTML = `
      <div class="chat-message assistant-message">
        <div class="message-avatar">✦</div>
        <div class="message-content">
          <p>Welcome! I'm your docked co-pilot. As you write LaTeX on the left, ask me for literature citations, taxonomy tables, or math equations.</p>
          <p style="margin-top:6px; font-size:12px; color:var(--text-muted);">Press <strong>"Audit &amp; Compile Draft"</strong> or <kbd>Ctrl+Enter</kbd> to compile your LaTeX and view the rendered output below.</p>
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

    const bufferDiv = document.createElement('div');
    bufferDiv.className = 'chat-message assistant-message chat-buffer-msg';
    bufferDiv.id = 'dockedTypingIndicator';
    bufferDiv.innerHTML = `
      <div class="message-avatar">✦</div>
      <div class="message-content buffer-content">
        <div class="chat-buffer-dots"><span></span><span></span><span></span></div>
        <span class="buffer-text">Consulting literature corpus &amp; LLM...</span>
      </div>
    `;
    this.dockedChatMessages?.appendChild(bufferDiv);
    this.scrollDockedToBottom();

    try {
      const res = await api.sendMessage(project.id, trimmed);
      this.isWaitingResponse = false;
      bufferDiv.remove();
      this.appendDockedChatMessage(res);
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
      <div class="message-content">${formatMarkdown(msg.content)}</div>
    `;
    this.dockedChatMessages.appendChild(div);
    this.scrollDockedToBottom();
  }

  scrollDockedToBottom() {
    if (this.dockedChatMessages)
      this.dockedChatMessages.scrollTop = this.dockedChatMessages.scrollHeight;
  }
}
