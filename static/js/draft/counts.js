// counts.js — Accurate word, character, and read-time counter excluding LaTeX markup

export function calculateLatexCounts(text) {
  if (!text) {
    return { words: 0, chars: 0, readTimeMinutes: 0, proseText: '' };
  }

  // 1. Remove comments (% to end of line)
  let clean = text.replace(/(?<!\\)%.*$/gm, '');

  // 2. Remove document preamble (\documentclass, \usepackage, \title, \author, etc.)
  clean = clean.replace(/\\(?:documentclass|usepackage|geometry|title|author|date|def|bibliographystyle|bibliography)\b(?:\[[^\]]*\])?(?:\{[^\}]*\})*/g, '');

  // 3. Remove display math ($$...$$, \[...\], \begin{equation}...\end{equation}, align, etc.)
  clean = clean.replace(/\$\$[\s\S]*?\$\$/g, '');
  clean = clean.replace(/\\\[[\s\S]*?\\\]/g, '');
  clean = clean.replace(/\\begin\{(?:equation|align|gather|multline)\*?\}[\s\S]*?\\end\{(?:equation|align|gather|multline)\*?\}/g, '');

  // 4. Remove inline math ($...$, \(...\))
  clean = clean.replace(/\$[^\$\n]+?\$/g, '');
  clean = clean.replace(/\\\([^\)]+?\\\)/g, '');

  // 5. Extract heading text from \section{...}, \subsection{...}
  clean = clean.replace(/\\(?:sub)*section\*?\{([^\}]+)\}/g, ' $1 ');

  // 6. Extract formatted text from \textbf{...}, \textit{...}, \emph{...}, etc.
  clean = clean.replace(/\\(?:textbf|textit|emph|texttt|underline|textsc)\{([^\}]+)\}/g, ' $1 ');

  // 7. Remove \cite{...}, \ref{...}, \label{...}
  clean = clean.replace(/\\(?:cite|ref|pageref|label)\b(?:\[[^\]]*\])?\{[^\}]*\}/g, '');

  // 8. Remove \begin{...} and \end{...} tags
  clean = clean.replace(/\\(?:begin|end)\{[^\}]+\}/g, '');

  // 9. Remove remaining backslash commands and special syntax tokens
  clean = clean.replace(/\\[a-zA-Z]+\b/g, ' ');
  clean = clean.replace(/[{}\\]/g, ' ');

  // Normalize whitespace
  clean = clean.trim().replace(/\s+/g, ' ');

  const words = clean ? clean.split(/\s+/).filter(Boolean).length : 0;
  const chars = clean.length;
  const readTimeMinutes = Math.max(1, Math.round(words / 150));

  return {
    words,
    chars,
    readTimeMinutes,
    proseText: clean
  };
}
