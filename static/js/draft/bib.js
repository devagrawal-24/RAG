// bib.js — Client-side BibTeX generator, key parser, and bib sync manager

export function generateClientBibKey(paper, index = 1) {
  let firstAuthor = 'author';
  const authors = paper.authors || '';
  if (authors) {
    const primary = authors.split(/,|and/)[0].trim();
    const parts = primary.split(/\s+/).filter(Boolean);
    if (parts.length > 0) {
      firstAuthor = parts[parts.length - 1].replace(/[^a-zA-Z]/g, '').toLowerCase() || 'author';
    }
  }

  let year = '2024';
  const ym = (paper.created_at || '' + ' ' + (paper.title || '')).match(/\b(19\d\d|20\d\d)\b/);
  if (ym) year = ym[1];

  let firstWord = 'paper';
  const title = paper.title || paper.original_name || '';
  const words = title.match(/[a-zA-Z]{3,}/g) || [];
  const stopwords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'towards', 'using']);
  for (const w of words) {
    if (!stopwords.has(w.toLowerCase())) {
      firstWord = w.toLowerCase();
      break;
    }
  }

  return `${firstAuthor}${year}${firstWord}`;
}

export function generateBibtexFromPapers(papers = []) {
  const usedKeys = {};
  const entries = [];

  papers.forEach((p, idx) => {
    const baseKey = generateClientBibKey(p, idx + 1);
    let key = baseKey;
    if (usedKeys[baseKey]) {
      usedKeys[baseKey]++;
      key = `${baseKey}${String.fromCharCode(96 + usedKeys[baseKey])}`;
    } else {
      usedKeys[baseKey] = 1;
    }

    const title = (p.title || p.original_name || 'Scientific Research Paper')
      .replace(/[\\&%$#_{}~^]/g, '')
      .replace(/\b([A-Z]{2,})\b/g, '{$1}');
    const author = (p.authors || 'Unknown Researcher').replace(/[\\&%$#_{}~^]/g, '');
    const yearMatch = (p.title || '' + ' ' + (p.created_at || '')).match(/\b(19\d\d|20\d\d)\b/);
    const year = yearMatch ? yearMatch[1] : '2024';

    const isConf = /(conference|proceedings|symposium|workshop)/i.test(p.title || '');
    const type = isConf ? 'inproceedings' : 'article';

    let entry = `@${type}{${key},\n`;
    entry += `  title = {${title}},\n`;
    entry += `  author = {${author}},\n`;
    entry += `  year = {${year}},\n`;
    if (type === 'inproceedings') {
      entry += `  booktitle = {Proceedings of the IEEE/ACM International Conference},\n`;
    } else {
      entry += `  journal = {IEEE Transactions on Knowledge and Data Engineering},\n`;
    }
    entry += `  note = {Survey Paper AI-Assistant Corpus}\n`;
    entry += `}`;
    entries.push(entry);
  });

  return entries.join('\n\n');
}

export function extractBibKeys(bibtexString) {
  if (!bibtexString) return [];
  const keys = [];
  const regex = /@(?:article|inproceedings|book|misc|techreport|phdthesis)\s*\{\s*([^,\s]+)/gi;
  let match;
  while ((match = regex.exec(bibtexString)) !== null) {
    keys.push(match[1]);
  }
  return keys;
}
