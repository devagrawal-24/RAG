// editor.js — CodeMirror 5 integration with LaTeX stex mode, shortcuts, snippets, and autocomplete

const COMMON_LATEX_COMMANDS = [
  'section', 'subsection', 'subsubsection', 'paragraph',
  'textbf', 'textit', 'texttt', 'emph', 'underline',
  'begin', 'end', 'cite', 'ref', 'label', 'caption',
  'includegraphics', 'centering', 'item', 'maketitle',
  'table', 'figure', 'equation', 'align', 'tabular',
  'documentclass', 'usepackage', 'geometry', 'bibliographystyle', 'bibliography'
];

export class DraftCodeMirrorEditor {
  constructor(containerEl, options = {}) {
    this.containerEl = containerEl;
    this.options = options;
    this.cm = null;
    this.bibPapers = [];
    this.init();
  }

  init() {
    if (!window.CodeMirror) {
      console.warn('CodeMirror library not loaded globally.');
      return;
    }

    this.cm = window.CodeMirror(this.containerEl, {
      value: this.options.initialValue || '',
      mode: 'stex',
      lineNumbers: true,
      lineWrapping: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      styleActiveLine: true,
      theme: 'default',
      extraKeys: {
        'Ctrl-Enter': () => this.options.onCompile && this.options.onCompile(),
        'Cmd-Enter': () => this.options.onCompile && this.options.onCompile(),
        'Ctrl-S': (cm) => {
          if (this.options.onSave) this.options.onSave(cm.getValue());
        },
        'Cmd-S': (cm) => {
          if (this.options.onSave) this.options.onSave(cm.getValue());
        },
        'Ctrl-Space': 'autocomplete',
        'Tab': (cm) => {
          if (cm.somethingSelected()) {
            cm.indentSelection('add');
          } else {
            cm.replaceSelection('  ', 'end', '+input');
          }
        }
      }
    });

    this.setupAutocomplete();
    this.setupChangeListeners();
  }

  setBibPapers(papers) {
    this.bibPapers = papers || [];
  }

  setupAutocomplete() {
    if (!window.CodeMirror || !window.CodeMirror.registerHelper) return;

    window.CodeMirror.registerHelper('hint', 'latex', (cm) => {
      const cur = cm.getCursor();
      const token = cm.getTokenAt(cur);
      const line = cm.getLine(cur.line);
      const lineUpToCur = line.slice(0, cur.ch);

      // Check for \cite{... autocomplete
      const citeMatch = lineUpToCur.match(/\\cite\{([^}]*)$/);
      if (citeMatch) {
        const query = citeMatch[1].toLowerCase();
        const list = [];
        this.bibPapers.forEach((p) => {
          const key = p._bib_key || p.id || 'ref';
          const author = p.authors ? p.authors.split(',')[0].trim() : 'Author';
          const yearMatch = (p.title || '' + ' ' + (p.created_at || '')).match(/\b(19\d\d|20\d\d)\b/);
          const year = yearMatch ? yearMatch[1] : '2024';
          const title = (p.title || p.original_name || '').slice(0, 45);

          const displayText = `${key} — ${author} (${year}) — ${title}`;
          if (!query || key.toLowerCase().includes(query) || displayText.toLowerCase().includes(query)) {
            list.push({
              text: key,
              displayText
            });
          }
        });

        return {
          list,
          from: window.CodeMirror.Pos(cur.line, cur.ch - citeMatch[1].length),
          to: cur
        };
      }

      // Check for \ command autocomplete
      const cmdMatch = lineUpToCur.match(/\\([a-zA-Z]*)$/);
      if (cmdMatch) {
        const query = cmdMatch[1].toLowerCase();
        const list = COMMON_LATEX_COMMANDS
          .filter((c) => c.toLowerCase().startsWith(query))
          .map((c) => ({
            text: c,
            displayText: `\\${c}`
          }));

        return {
          list,
          from: window.CodeMirror.Pos(cur.line, cur.ch - cmdMatch[1].length),
          to: cur
        };
      }

      return null;
    });

    // Auto-close \begin{env} with \end{env}
    this.cm.on('change', (cm, change) => {
      if (change.origin === '+input' && change.text.length === 1 && change.text[0] === '}') {
        const cur = cm.getCursor();
        const line = cm.getLine(cur.line);
        const upToCursor = line.slice(0, cur.ch);
        const match = upToCursor.match(/\\begin\{([a-zA-Z*]+)\}$/);
        if (match) {
          const envName = match[1];
          const closing = `\n  \n\\end{${envName}}`;
          cm.replaceSelection(closing);
          cm.setCursor({ line: cur.line + 1, ch: 2 });
        }
      }
    });
  }

  setupChangeListeners() {
    this.cm.on('change', () => {
      if (this.options.onChange) {
        this.options.onChange(this.cm.getValue());
      }
    });

    this.cm.on('cursorActivity', () => {
      if (this.options.onCursor) {
        const cur = this.cm.getCursor();
        const sel = this.cm.getSelection();
        this.options.onCursor({
          line: cur.line + 1,
          ch: cur.ch + 1,
          selectionLength: sel.length
        });
      }
    });
  }

  getValue() {
    return this.cm ? this.cm.getValue() : '';
  }

  setValue(val) {
    if (this.cm && val !== this.cm.getValue()) {
      this.cm.setValue(val);
    }
  }

  insertSnippet(type) {
    if (!this.cm) return;
    const sel = this.cm.getSelection();
    const cur = this.cm.getCursor();

    if (type === 'textbf') {
      if (sel) {
        this.cm.replaceSelection(`\\textbf{${sel}}`);
      } else {
        this.cm.replaceSelection('\\textbf{}');
        this.cm.setCursor({ line: cur.line, ch: cur.ch + 8 });
      }
    } else if (type === 'textit') {
      if (sel) {
        this.cm.replaceSelection(`\\textit{${sel}}`);
      } else {
        this.cm.replaceSelection('\\textit{}');
        this.cm.setCursor({ line: cur.line, ch: cur.ch + 8 });
      }
    } else if (type === 'section') {
      const heading = sel || 'Section Title';
      this.cm.replaceSelection(`\\section{${heading}}\n`);
    } else if (type === 'subsection') {
      const heading = sel || 'Subsection Title';
      this.cm.replaceSelection(`\\subsection{${heading}}\n`);
    } else if (type === 'itemize') {
      const text = `\\begin{itemize}\n  \\item First item\n  \\item Second item\n\\end{itemize}\n`;
      this.cm.replaceSelection(text);
      this.cm.setCursor({ line: cur.line + 1, ch: 8 });
    } else if (type === 'table') {
      const text = `\\begin{table}[h]\n\\centering\n\\caption{Table Caption}\n\\label{tab:sample}\n\\begin{tabular}{lcc}\n\\toprule\nParam & Value & Metric \\\\\n\\midrule\nModel & RAG & 94.2 \\\\\n\\bottomrule\n\\end{tabular}\n\\end{table}\n`;
      this.cm.replaceSelection(text);
      this.cm.setCursor({ line: cur.line + 2, ch: 9 });
    } else if (type === 'equation') {
      const text = `\\begin{equation}\n\\label{eq:sample}\nf(x) = \\sum_{i=1}^n a_i x_i\n\\end{equation}\n`;
      this.cm.replaceSelection(text);
      this.cm.setCursor({ line: cur.line + 2, ch: 0 });
    } else if (type === 'cite') {
      this.cm.replaceSelection('\\cite{}');
      this.cm.setCursor({ line: cur.line, ch: cur.ch + 6 });
      setTimeout(() => {
        window.CodeMirror.commands.autocomplete(this.cm);
      }, 50);
    }
    this.cm.focus();
  }

  jumpToLine(lineNum) {
    if (!this.cm || !lineNum) return;
    const targetLine = Math.max(0, lineNum - 1);
    this.cm.setCursor({ line: targetLine, ch: 0 });
    this.cm.scrollIntoView({ line: targetLine, ch: 0 }, 100);
    this.cm.setSelection({ line: targetLine, ch: 0 }, { line: targetLine, ch: this.cm.getLine(targetLine).length });
    
    // Flash line highlight
    const lineHandle = this.cm.addLineClass(targetLine, 'background', 'cm-line-error-flash');
    setTimeout(() => {
      this.cm.removeLineClass(lineHandle, 'background', 'cm-line-error-flash');
    }, 1500);
    this.cm.focus();
  }

  applyErrorMarkers(errors = []) {
    if (!this.cm) return;
    this.cm.clearGutter('CodeMirror-lint-markers');
    errors.forEach((err) => {
      if (err.line) {
        const marker = document.createElement('div');
        marker.className = 'cm-error-gutter-marker';
        marker.title = err.message;
        marker.innerHTML = '●';
        this.cm.setGutterMarker(err.line - 1, 'CodeMirror-lint-markers', marker);
      }
    });
  }
}
