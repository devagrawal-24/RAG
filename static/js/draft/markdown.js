// markdown.js — Clean Markdown to LaTeX converter for Survey Paper AI-Assistant

export function isMarkdownContent(text) {
  if (!text) return false;
  const trimmed = text.trim();
  // If it already has \documentclass, it's LaTeX
  if (trimmed.includes('\\documentclass')) return false;
  // If it has markdown headers or topic guideline syntax
  const hasHeaders = /^#{1,4}\s+/m.test(trimmed);
  const hasTopic = /^\*Topic:\s*.*?\*/m.test(trimmed);
  return hasHeaders || hasTopic;
}

export function escapeLatexSpecial(text) {
  if (!text) return '';
  // Don't escape math spans $...$ or $$...$$
  const mathTokens = [];
  let s = text.replace(/(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$)/g, (match) => {
    mathTokens.push(match);
    return `__MATH_TOKEN_${mathTokens.length - 1}__`;
  });

  // Escape backslash first (if not part of standard LaTeX commands)
  s = s.replace(/\\/g, '\\textbackslash{}');
  // Escape & % $ # _ { } ~ ^
  s = s
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');

  // Restore math tokens
  s = s.replace(/__MATH_TOKEN_(\d+)__/g, (_, idx) => mathTokens[parseInt(idx, 10)] || '');
  return s;
}

export function convertMarkdownToLatex(markdownText, projectMeta = {}) {
  if (!markdownText) return '';

  const lines = markdownText.split(/\r?\n/);
  let docTitle = projectMeta.title || projectMeta.name || '';
  let docTopic = projectMeta.topic || '';
  let inItemize = false;
  let inEnumerate = false;
  let inAbstract = false;

  const out = [];

  // Preamble setup
  out.push('% Auto-converted from Markdown via Survey Paper AI-Assistant');
  out.push('\\documentclass[conference]{IEEEtran}');
  out.push('\\usepackage[utf8]{inputenc}');
  out.push('\\usepackage{cite}');
  out.push('\\usepackage{amsmath,amssymb,amsfonts}');
  out.push('\\usepackage{graphicx}');
  out.push('\\usepackage{booktabs}');
  out.push('\\usepackage{hyperref}');
  out.push('');

  const bodyLines = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Check for *Topic: ...*
    const topicMatch = line.match(/^\*Topic:\s*(.*?)\*$/i);
    if (topicMatch) {
      docTopic = topicMatch[1].trim();
      bodyLines.push(`% Topic: ${docTopic}`);
      continue;
    }

    // Markdown title: # Title
    const titleMatch = line.match(/^#\s+(.+)$/);
    if (titleMatch) {
      docTitle = titleMatch[1].trim();
      continue;
    }

    // Close lists if non-list line
    const isItem = /^\s*[-*]\s+(.+)/.test(line);
    const isEnum = /^\s*\d+\.\s+(.+)/.test(line);

    if (inItemize && !isItem) {
      bodyLines.push('\\end{itemize}');
      inItemize = false;
    }
    if (inEnumerate && !isEnum) {
      bodyLines.push('\\end{enumerate}');
      inEnumerate = false;
    }

    // Markdown section: ## Section
    const secMatch = line.match(/^##\s+(.+)$/);
    if (secMatch) {
      const heading = secMatch[1].trim();
      if (heading.toLowerCase() === 'abstract') {
        if (inAbstract) bodyLines.push('\\end{abstract}');
        bodyLines.push('\\begin{abstract}');
        inAbstract = true;
      } else {
        if (inAbstract) {
          bodyLines.push('\\end{abstract}');
          inAbstract = false;
        }
        bodyLines.push(`\\section{${escapeLatexSpecial(heading)}}`);
      }
      continue;
    }

    // Markdown subsection: ### Subsection
    const subMatch = line.match(/^###\s+(.+)$/);
    if (subMatch) {
      if (inAbstract) {
        bodyLines.push('\\end{abstract}');
        inAbstract = false;
      }
      bodyLines.push(`\\subsection{${escapeLatexSpecial(subMatch[1].trim())}}`);
      continue;
    }

    // Itemize
    if (isItem) {
      if (!inItemize) {
        bodyLines.push('\\begin{itemize}');
        inItemize = true;
      }
      const itemContent = line.replace(/^\s*[-*]\s+/, '').trim();
      bodyLines.push(`  \\item ${convertInlineMarkdown(itemContent)}`);
      continue;
    }

    // Enumerate
    if (isEnum) {
      if (!inEnumerate) {
        bodyLines.push('\\begin{enumerate}');
        inEnumerate = true;
      }
      const enumContent = line.replace(/^\s*\d+\.\s+/, '').trim();
      bodyLines.push(`  \\item ${convertInlineMarkdown(enumContent)}`);
      continue;
    }

    // Blank line
    if (!line.trim()) {
      bodyLines.push('');
      continue;
    }

    // Standard prose line
    bodyLines.push(convertInlineMarkdown(line));
  }

  if (inItemize) bodyLines.push('\\end{itemize}');
  if (inEnumerate) bodyLines.push('\\end{enumerate}');
  if (inAbstract) bodyLines.push('\\end{abstract}');

  // Title & Author in preamble
  const cleanTitle = (docTitle || 'Survey Paper Title').replace(/[\\{}]/g, '');
  out.push(`\\title{${escapeLatexSpecial(cleanTitle)}}`);
  out.push('\\author{\\IEEEauthorblockN{First Author, Second Author}\\\\');
  out.push('\\IEEEauthorblockA{\\textit{Department of Computer Science} \\\\');
  out.push('\\textit{Research Institution / University}\\\\');
  out.push('Email: author@institution.edu}}');
  out.push('');
  out.push('\\begin{document}');
  out.push('');
  out.push('\\maketitle');
  out.push('');

  out.push(bodyLines.join('\n'));
  out.push('');
  out.push('\\bibliographystyle{IEEEtran}');
  out.push('\\bibliography{references}');
  out.push('');
  out.push('\\end{document}');

  return out.join('\n');
}

export function convertInlineMarkdown(text) {
  if (!text) return '';

  let s = text;

  // Protect code backticks first: `code`
  const codeSpans = [];
  s = s.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code);
    return `__CODE_SPAN_${codeSpans.length - 1}__`;
  });

  // Protect markdown links: [text](url)
  const linkSpans = [];
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    linkSpans.push({ label, url });
    return `__LINK_SPAN_${linkSpans.length - 1}__`;
  });

  // Bold: **text**
  s = s.replace(/\*\*([^*]+)\*\*/g, (_, bold) => `\\textbf{${escapeLatexSpecial(bold)}}`);

  // Italic: *text* or _text_
  s = s.replace(/\*([^*]+)\*/g, (_, it) => `\\textit{${escapeLatexSpecial(it)}}`);
  s = s.replace(/(?<!\w)_([^_]+)_(?!\w)/g, (_, it) => `\\textit{${escapeLatexSpecial(it)}}`);

  // Escape normal text outside math & placeholders
  s = escapeLatexSpecial(s);

  // Restore links: \href{url}{text}
  s = s.replace(/__LINK_SPAN_(\d+)__/g, (_, idx) => {
    const item = linkSpans[parseInt(idx, 10)];
    return item ? `\\href{${item.url}}{${escapeLatexSpecial(item.label)}}` : '';
  });

  // Restore code: \texttt{code}
  s = s.replace(/__CODE_SPAN_(\d+)__/g, (_, idx) => {
    const code = codeSpans[parseInt(idx, 10)];
    return code ? `\\texttt{${code}}` : '';
  });

  return s;
}
