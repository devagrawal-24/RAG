// export.js — Export Dossier packager using JSZip (client-side) or backend fallback

export async function exportProjectDossier(project, texSource, bibSource, latestPdfBytes = null) {
  const projName = (project?.name || 'Survey_Paper').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const filename = `${projName}_Dossier.zip`;

  // If JSZip is loaded globally via CDN
  if (window.JSZip) {
    const zip = new window.JSZip();
    zip.file('main.tex', texSource || '% LaTeX Survey Draft\n');
    zip.file('references.bib', bibSource || '% References\n');
    
    if (latestPdfBytes) {
      zip.file('main.pdf', latestPdfBytes);
    }

    const readme = `# Survey Paper Dossier: ${project?.name || 'Academic Survey'}
Topic: ${project?.topic || 'Literature Review'}
Generated via Survey Paper AI-Assistant

Files included:
- main.tex: IEEE LaTeX source code
- references.bib: BibTeX references
- main.pdf: Compiled two-column academic paper
`;
    zip.file('README.md', readme);

    const blob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  }

  // Fallback to backend streaming route
  if (project?.id) {
    window.location.href = `/api/projects/${project.id}/export?format=zip`;
    return true;
  }

  return false;
}
