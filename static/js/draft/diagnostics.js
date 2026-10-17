// diagnostics.js — Pre-compile client-side structural audit and log error locator

export function runClientPreCompileAudit(texSource, availableBibKeys = []) {
  const warnings = [];

  if (!texSource) return warnings;

  // 1. Unmatched curly braces
  let braceDepth = 0;
  const lines = texSource.split(/\r?\n/);
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    // Strip comments
    const line = rawLine.replace(/(?<!\\)%.*$/, '');
    for (let charIdx = 0; charIdx < line.length; charIdx++) {
      if (line[charIdx] === '{' && (charIdx === 0 || line[charIdx - 1] !== '\\')) {
        braceDepth++;
      } else if (line[charIdx] === '}' && (charIdx === 0 || line[charIdx - 1] !== '\\')) {
        braceDepth--;
        if (braceDepth < 0) {
          warnings.push({
            severity: 'error',
            line: lineIdx + 1,
            message: 'Unexpected closing brace "}" without matching open brace.'
          });
          braceDepth = 0;
        }
      }
    }
  }

  if (braceDepth > 0) {
    warnings.push({
      severity: 'error',
      line: lines.length,
      message: `Unclosed curly brace detected (${braceDepth} missing closing brace "}" in document).`
    });
  }

  // 2. Unmatched \begin{env} and \end{env}
  const envStack = [];
  const envRegex = /\\(begin|end)\{([a-zA-Z*]+)\}/g;
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx].replace(/(?<!\\)%.*$/, '');
    let m;
    while ((m = envRegex.exec(line)) !== null) {
      const type = m[1];
      const envName = m[2];
      if (type === 'begin') {
        envStack.push({ envName, line: lineIdx + 1 });
      } else {
        if (envStack.length === 0) {
          warnings.push({
            severity: 'error',
            line: lineIdx + 1,
            message: `\\end{${envName}} without matching \\begin{${envName}}.`
          });
        } else {
          const top = envStack.pop();
          if (top.envName !== envName) {
            warnings.push({
              severity: 'error',
              line: lineIdx + 1,
              message: `Mismatched environment: \\begin{${top.envName}} on line ${top.line} closed by \\end{${envName}} on line ${lineIdx + 1}.`
            });
          }
        }
      }
    }
  }

  while (envStack.length > 0) {
    const unclosed = envStack.pop();
    warnings.push({
      severity: 'error',
      line: unclosed.line,
      message: `Unclosed environment \\begin{${unclosed.envName}} on line ${unclosed.line} never terminated with \\end{${unclosed.envName}}.`
    });
  }

  // 3. Citations missing from bibliography
  if (availableBibKeys && availableBibKeys.length > 0) {
    const keySet = new Set(availableBibKeys.map((k) => k.toLowerCase()));
    const citeRegex = /\\cite(?:\[[^\]]*\])?\{([^}]+)\}/g;
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx].replace(/(?<!\\)%.*$/, '');
      let m;
      while ((m = citeRegex.exec(line)) !== null) {
        const keys = m[1].split(',').map((k) => k.trim());
        for (const k of keys) {
          if (k && !keySet.has(k.toLowerCase())) {
            warnings.push({
              severity: 'warning',
              line: lineIdx + 1,
              message: `Citation key "${k}" is not in references.bib.`
            });
          }
        }
      }
    }
  }

  // 4. Empty sections check
  const secRegex = /\\section\*?\{([^}]+)\}/g;
  let lastSec = null;
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx].trim();
    const match = secRegex.exec(line);
    if (match) {
      if (lastSec && lastSec.line === lineIdx) {
        warnings.push({
          severity: 'warning',
          line: lastSec.line + 1,
          message: `Section "${lastSec.title}" appears empty.`
        });
      }
      lastSec = { title: match[1], line: lineIdx };
    } else if (line && !line.startsWith('%') && !line.startsWith('\\') && lastSec) {
      lastSec = null;
    }
  }

  return warnings;
}
