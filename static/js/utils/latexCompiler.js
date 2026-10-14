// latexCompiler.js - Client-Side LaTeX Compiler & Output Preview Renderer
import { escapeHtml } from './formatters.js';

export function compileLatexToHtml(latexCode) {
  if (!latexCode || !latexCode.trim()) {
    return `
      <div class="latex-compiled-placeholder">
        <p>No LaTeX content to compile. Enter LaTeX document text in the editor and click <strong>"Audit & Compile Draft"</strong>.</p>
      </div>
    `;
  }

  // Strip LaTeX comments
  let text = latexCode.replace(/%.*/g, '');

  // Extract Document Metadata
  let titleMatch = text.match(/\\title\{([^\}]+)\}/);
  let authorMatch = text.match(/\\author\{([^\}]+)\}/);
  let dateMatch = text.match(/\\date\{([^\}]+)\}/);

  let title = titleMatch ? titleMatch[1].replace(/\\vspace\{[^\}]+\}/g, '').replace(/\\textbf\{([^\}]+)\}/g, '$1').trim() : '';
  let author = authorMatch ? authorMatch[1].replace(/\\vspace\{[^\}]+\}/g, '').replace(/\\textbf\{([^\}]+)\}/g, '$1').replace(/\\\\/g, ' | ').replace(/\\textit\{([^\}]+)\}/g, '$1').trim() : '';
  let date = dateMatch ? dateMatch[1].replace(/\\vspace\{[^\}]+\}/g, '').replace(/\\textbf\{([^\}]+)\}/g, '$1').replace(/\\today/g, new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })).trim() : '';

  // Extract Abstract
  let abstractMatch = text.match(/\\begin\{abstract\}([\s\S]*?)\\end\{abstract\}/);
  let abstractText = abstractMatch ? abstractMatch[1].trim() : '';

  // Process Document Body
  let bodyContent = text;
  let docBodyMatch = text.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  if (docBodyMatch) {
    bodyContent = docBodyMatch[1];
  }

  bodyContent = bodyContent.replace(/\\maketitle/g, '');
  bodyContent = bodyContent.replace(/\\begin\{abstract\}[\s\S]*?\\end\{abstract\}/g, '');

  let sectionCount = 0;
  let subsectionCount = 0;

  // Format sections
  bodyContent = bodyContent.replace(/\\section\*?\{([^\}]+)\}/g, (match, secTitle) => {
    sectionCount++;
    subsectionCount = 0;
    return `<h2 class="latex-sec-head"><span class="latex-sec-num">${sectionCount}.</span> ${escapeHtml(secTitle)}</h2>`;
  });

  bodyContent = bodyContent.replace(/\\subsection\*?\{([^\}]+)\}/g, (match, subsecTitle) => {
    subsectionCount++;
    return `<h3 class="latex-subsec-head"><span class="latex-sec-num">${sectionCount}.${subsectionCount}</span> ${escapeHtml(subsecTitle)}</h3>`;
  });

  bodyContent = bodyContent.replace(/\\subsubsection\*?\{([^\}]+)\}/g, (match, subsubsecTitle) => {
    return `<h4 class="latex-subsubsec-head">${escapeHtml(subsubsecTitle)}</h4>`;
  });

  // Formatting commands
  bodyContent = bodyContent.replace(/\\textbf\{([^\}]+)\}/g, '<strong>$1</strong>');
  bodyContent = bodyContent.replace(/\\textit\{([^\}]+)\}/g, '<em>$1</em>');
  bodyContent = bodyContent.replace(/\\emph\{([^\}]+)\}/g, '<em>$1</em>');
  bodyContent = bodyContent.replace(/\\texttt\{([^\}]+)\}/g, '<code>$1</code>');
  bodyContent = bodyContent.replace(/\\cite\{([^\}]+)\}/g, '<span class="latex-cite-tag">[$1]</span>');
  bodyContent = bodyContent.replace(/\\ref\{([^\}]+)\}/g, '<span class="latex-ref-tag">Ref: $1</span>');

  // Environments: itemize / enumerate
  bodyContent = bodyContent.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (match, listContent) => {
    const items = listContent.split('\\item').slice(1).map(item => `<li>${escapeHtml(item.trim())}</li>`).join('');
    return `<ul class="latex-list">${items}</ul>`;
  });

  bodyContent = bodyContent.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (match, listContent) => {
    const items = listContent.split('\\item').slice(1).map(item => `<li>${escapeHtml(item.trim())}</li>`).join('');
    return `<ol class="latex-list">${items}</ol>`;
  });

  // Equations
  bodyContent = bodyContent.replace(/\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g, (match, eqContent) => {
    return `<div class="latex-equation-box"><span class="latex-math-formula">${escapeHtml(eqContent.trim())}</span></div>`;
  });

  // Tables
  bodyContent = bodyContent.replace(/\\begin\{table\}[\s\S]*?\\begin\{tabular\}\{[^\}]*\}([\s\S]*?)\\end\{tabular\}[\s\S]*?\\end\{table\}/g, (match, tabularBody) => {
    const rows = tabularBody.split('\\\\').map(r => r.trim()).filter(Boolean);
    let tableRowsHtml = rows.map((r, i) => {
      const cols = r.replace(/\\hline/g, '').split('&').map(c => c.trim());
      if (cols.every(c => !c)) return '';
      const cellTag = i === 0 ? 'th' : 'td';
      const cells = cols.map(c => `<${cellTag}>${escapeHtml(c)}</${cellTag}>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<div class="latex-table-container"><table class="latex-table">${tableRowsHtml}</table></div>`;
  });

  const paras = bodyContent.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const formattedBody = paras.map(p => {
    if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<ol') || p.startsWith('<div')) {
      return p;
    }
    return `<p class="latex-para">${p.replace(/\n/g, ' ')}</p>`;
  }).join('');

  return `
    <div class="latex-paper-sheet">
      ${title ? `<h1 class="latex-paper-title">${escapeHtml(title)}</h1>` : ''}
      ${author ? `<div class="latex-paper-author">${escapeHtml(author)}</div>` : ''}
      ${date ? `<div class="latex-paper-date">${escapeHtml(date)}</div>` : ''}
      
      ${abstractText ? `
        <div class="latex-abstract-box">
          <div class="latex-abstract-heading">ABSTRACT</div>
          <p class="latex-abstract-text">${escapeHtml(abstractText)}</p>
        </div>
      ` : ''}

      <div class="latex-paper-body">
        ${formattedBody}
      </div>
    </div>
  `;
}
