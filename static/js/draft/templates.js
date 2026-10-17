// templates.js — Full IEEEtran Document & Outline Templates

export const IEEE_FULL_TEMPLATE = `\\documentclass[conference]{IEEEtran}
\\usepackage[utf8]{inputenc}
\\usepackage{cite}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{textcomp}
\\usepackage{xcolor}
\\usepackage{booktabs}
\\usepackage{hyperref}

\\def\\BibTeX{{\\rm B\\kern-.05em{\\sc i\\kern-.025em b}\\kern-.08em
    T\\kern-.1667em\\lower.7ex\\hbox{E}\\kern-.125emX}}

\\begin{document}

\\title{A Comprehensive Survey of Recent Methodological Advances in Modern Scientific Domains}

\\author{\\IEEEauthorblockN{First Author}
\\IEEEauthorblockA{\\textit{Department of Computer Science} \\\\
\\textit{University of Advanced Research}\\\\
City, Country \\\\
email: author1@university.edu}
\\and
\\IEEEauthorblockN{Second Author}
\\IEEEauthorblockA{\\textit{Department of Data Systems} \\\\
\\textit{Global Research Institute}\\\\
City, Country \\\\
email: author2@institute.org}
}

\\maketitle

\\begin{abstract}
This survey paper provides an exhaustive review and structured taxonomy of contemporary research methodologies. We evaluate empirical benchmarks across peer-reviewed literature, categorize foundational paradigms, and identify open challenges that motivate upcoming directions in academic research.
\\end{abstract}

\\begin{IEEEkeywords}
survey, literature review, taxonomy, empirical analysis, open challenges
\\end{IEEEkeywords}

\\section{Introduction}
The rapid proliferation of scientific publications necessitates coherent synthesis and comparative categorization. In this survey, we organize contemporary findings to guide early-stage and advanced researchers through current paradigms and trade-offs.

\\section{Taxonomy and Architectural Paradigms}
Existing approaches can be classified along architectural, computational, and domain-specific dimensions:
\\begin{itemize}
  \\item \\textbf{Supervised Representations:} High-precision benchmarks with annotated corpora.
  \\item \\textbf{Hybrid & Retrieval Models:} Grounded context synthesis with source attribution.
  \\item \\textbf{Autonomous Pipelines:} Scalable end-to-end evaluation with reproducible workflows.
\\end{itemize}

\\begin{table}[h]
\\centering
\\caption{Comparative Taxonomy Matrix of State-of-the-Art Approaches}
\\label{tab:taxonomy}
\\begin{tabular}{lccc}
\\toprule
\\textbf{Methodology} & \\textbf{Scalability} & \\textbf{Latency} & \\textbf{Attribution} \\\\
\\midrule
Baseline Heuristics   & High                 & Low              & Limited              \\\\
Dense Embeddings      & Moderate             & Moderate         & High                 \\\\
Hybrid RAG Engine     & Scalable             & Sub-second       & Verifiable           \\\\
\\bottomrule
\\end{tabular}
\\end{table}

\\section{Empirical Findings and Benchmarks}
Benchmark evaluations across representative tasks demonstrate that hybrid grounding reduces hallucination while maintaining high lexical coverage.

\\begin{equation}
\\label{eq:score}
S(q, d) = \\alpha \\cdot \\text{BM25}(q, d) + (1 - \\alpha) \\cdot \\cos(\\mathbf{e}_q, \\mathbf{e}_d)
\\end{equation}

\\section{Open Challenges and Future Directions}
Despite recent progress, critical challenges remain unresolved:
\\begin{enumerate}
  \\item Real-time boundary-aware chunking of complex two-column PDF structures.
  \\item Provable attribution grounding without synthetic distortion.
  \\item Cross-domain generalization across low-resource academic repositories.
\\end{enumerate}

\\section{Conclusion}
This paper synthesized state-of-the-art literature into an actionable taxonomy and comparative matrix. Future research should prioritize reproducible benchmarks and verified literature attribution.

\\bibliographystyle{IEEEtran}
\\bibliography{references}

\\end{document}
`;

export function generateIeeeOutline(projectTitle = 'Survey Paper Title', projectTopic = 'Academic Literature Review', sections = []) {
  const lines = [
    `\\documentclass[conference]{IEEEtran}`,
    `\\usepackage[utf8]{inputenc}`,
    `\\usepackage{cite}`,
    `\\usepackage{amsmath,amssymb,amsfonts}`,
    `\\usepackage{graphicx}`,
    `\\usepackage{booktabs}`,
    `\\usepackage{hyperref}`,
    ``,
    `\\title{${projectTitle}}`,
    `\\author{\\IEEEauthorblockN{Author Name}\\\\`,
    `\\IEEEauthorblockA{\\textit{Department of Computer Science} \\\\`,
    `\\textit{Research Institution}\\\\`,
    `email: author@research.edu}}`,
    ``,
    `\\begin{document}`,
    ``,
    `\\maketitle`,
    ``,
    `\\begin{abstract}`,
    `This paper presents a grounded literature synthesis on ${projectTopic}. We review existing contributions, categorize emerging architectures, and delineate open research problems.`,
    `\\end{abstract}`,
    ``,
    `\\begin{IEEEkeywords}`,
    `${projectTopic.toLowerCase().replace(/[^a-z0-9 ]/g, '')}, survey, taxonomy, comparative evaluation`,
    `\\end{IEEEkeywords}`,
    ``
  ];

  if (sections && sections.length > 0) {
    sections.forEach((sec) => {
      const title = sec.title || 'Section';
      const num = sec.number ? `${sec.number} ` : '';
      const cites = (sec.suggested_citations || []).join(', ');
      lines.push(`\\section{${num}${title}}`);
      if (cites) lines.push(`% Suggested citations: ${cites}`);
      if (sec.description) lines.push(`% Description: ${sec.description}`);
      lines.push(`% Synthesize key findings, comparative methodology, and empirical trade-offs here.`);
      lines.push(``);
    });
  } else {
    // Standard IEEE Survey Sections
    lines.push(
      `\\section{Introduction}`,
      `% Formulate the central problem, background context, and motivation for this survey.`,
      ``,
      `\\section{Taxonomy and Methodological Comparison}`,
      `% Classify contemporary paradigms into a rigorous taxonomy and matrix.`,
      ``,
      `\\section{Empirical Findings and Benchmarks}`,
      `% Analyze experimental results, evaluation metrics, and performance trade-offs.`,
      ``,
      `\\section{Open Challenges and Future Directions}`,
      `% Identify unresolved gaps and emerging research directions.`,
      ``,
      `\\section{Conclusion}`,
      `% Conclude with overarching synthesis and actionable takeaways.`,
      ``
    );
  }

  lines.push(
    `\\bibliographystyle{IEEEtran}`,
    `\\bibliography{references}`,
    ``,
    `\\end{document}`
  );

  return lines.join('\n');
}
