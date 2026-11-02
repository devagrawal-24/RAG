// compile.js — Compile state manager, abort controller, and PDF renderer via pdf.js

export class CompileManager {
  constructor(options = {}) {
    this.previewContainer = options.previewContainer;
    this.compileBtn = options.compileBtn;
    this.compileStatusChip = options.compileStatusChip;
    this.onLog = options.onLog || (() => {});
    this.currentAbortController = null;
    this.lastSuccessfulPdfData = null;
    this.lastSuccessfulTimestamp = null;
    this.currentPdfDoc = null;
    this.currentImagePages = null;
    this.currentPageNum = 1;
    this.totalPageCount = 1;
    this.zoomScale = 1.0;
    this.renderToken = 0;
  }

  setZoom(scale) {
    this.zoomScale = Math.max(0.4, Math.min(2.5, scale));
    if (this.currentPdfDoc) {
      this.renderPdfDoc(this.currentPdfDoc);
    } else if (this.currentImagePages && this.currentImagePages.length > 0) {
      this.renderImagePages(this.currentImagePages);
    }
  }

  zoomIn() {
    this.setZoom(this.zoomScale + 0.15);
  }

  zoomOut() {
    this.setZoom(this.zoomScale - 0.15);
  }

  async compile({ projectId, latexSrc, docTitle, bibSrc, paperSize = 'letter', onAuditComplete }) {
    if (!latexSrc || latexSrc.trim().length === 0) {
      throw new Error('LaTeX source is empty.');
    }

    // Cancel previous compile if active
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.currentAbortController = new AbortController();

    this.setCompilingState(true);
    this.updateStatusChip('Compiling…', 'compiling');

    try {
      const response = await fetch(`/api/projects/${projectId}/draft/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latex_source: latexSrc,
          title: docTitle,
          bib: bibSrc || '',
          paper_size: paperSize
        }),
        signal: this.currentAbortController.signal
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `Server responded with ${response.status}`);
      }

      const result = await response.json();
      this.setCompilingState(false);

      if (result.ok && (result.pdf_base64 || result.pdf_url)) {
        this.lastSuccessfulPdfData = result.pdf_base64;
        this.lastSuccessfulTimestamp = new Date();
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.updateStatusChip(`Compiled ${timeStr}`, 'success');
        await this.renderPdfFromBase64(result.pdf_base64, false);
      } else if (result.has_pdf && result.pdf_pages && result.pdf_pages.length > 0) {
        // High fidelity page sheets fallback
        this.renderImagePages(result.pdf_pages);
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.updateStatusChip(`Compiled ${timeStr}`, 'success');
      } else {
        // Compile failed
        const errCount = (result.errors || []).length;
        this.updateStatusChip(`Failed · ${errCount} error${errCount !== 1 ? 's' : ''}`, 'failed');
        if (this.lastSuccessfulPdfData) {
          await this.renderPdfFromBase64(this.lastSuccessfulPdfData, true);
        }
      }

      if (onAuditComplete) {
        onAuditComplete(result);
      }

      return result;
    } catch (err) {
      if (err.name === 'AbortError') {
        this.onLog('Previous compilation cancelled by new build request.');
        return null;
      }
      this.setCompilingState(false);
      this.updateStatusChip('Failed', 'failed');
      if (this.lastSuccessfulPdfData) {
        await this.renderPdfFromBase64(this.lastSuccessfulPdfData, true);
      }
      throw err;
    }
  }

  setCompilingState(isCompiling) {
    if (this.compileBtn) {
      if (isCompiling) {
        this.compileBtn.classList.add('loading');
        this.compileBtn.disabled = true;
      } else {
        this.compileBtn.classList.remove('loading');
        this.compileBtn.disabled = false;
      }
    }
    if (this.previewContainer) {
      if (isCompiling) {
        this.previewContainer.classList.add('shimmer-loading');
      } else {
        this.previewContainer.classList.remove('shimmer-loading');
      }
    }
  }

  updateStatusChip(text, stateClass) {
    if (!this.compileStatusChip) return;
    this.compileStatusChip.textContent = text;
    this.compileStatusChip.className = `draft-stat-chip compile-chip ${stateClass}`;
  }

  async renderPdfFromBase64(b64, isLastSuccessfulNotice = false) {
    if (!this.previewContainer) return;

    if (!window.pdfjsLib) {
      // Fallback: render embed object or download preview
      this.previewContainer.innerHTML = `
        <div class="pdf-container-inner">
          ${isLastSuccessfulNotice ? this.buildLastSuccessfulBanner() : ''}
          <iframe src="data:application/pdf;base64,${b64}" style="width:100%;height:100%;border:none;"></iframe>
        </div>
      `;
      return;
    }

    try {
      const pdfData = atob(b64);
      const loadingTask = window.pdfjsLib.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;
      this.currentPdfDoc = pdf;
      this.totalPageCount = pdf.numPages;
      await this.renderPdfDoc(pdf, isLastSuccessfulNotice);
    } catch (e) {
      console.error('pdf.js rendering failed, falling back to data URL', e);
      this.previewContainer.innerHTML = `
        <div class="pdf-container-inner">
          ${isLastSuccessfulNotice ? this.buildLastSuccessfulBanner() : ''}
          <iframe src="data:application/pdf;base64,${b64}" style="width:100%;height:100%;border:none;"></iframe>
        </div>
      `;
    }
  }

  async renderPdfDoc(pdf, isLastSuccessfulNotice = false) {
    if (!this.previewContainer) return;
    this.renderToken = (this.renderToken || 0) + 1;
    const token = this.renderToken;

    this.previewContainer.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'pdf-rendered-pages';

    if (isLastSuccessfulNotice) {
      wrapper.innerHTML += this.buildLastSuccessfulBanner();
    }

    const isZoomed = this.zoomScale > 1.0;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      if (this.renderToken !== token) return;
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: this.zoomScale * 1.35 });

      const pageCard = document.createElement('div');
      pageCard.className = 'latex-pdf-page-card';
      pageCard.dataset.pageNum = String(pageNum);
      pageCard.style.width = `${Math.round(viewport.width)}px`;
      pageCard.style.maxWidth = isZoomed ? 'none' : '100%';

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      canvas.style.display = 'block';
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';

      const renderContext = {
        canvasContext: ctx,
        viewport
      };

      await page.render(renderContext).promise;

      pageCard.appendChild(canvas);
      wrapper.appendChild(pageCard);
    }

    if (this.renderToken !== token) return;
    this.previewContainer.appendChild(wrapper);
    this.updatePageIndicator();
    this.setupScrollListener();
  }

  renderImagePages(pages) {
    if (!this.previewContainer) return;
    this.currentImagePages = pages;
    this.totalPageCount = pages.length;
    this.currentPageNum = 1;

    const isZoomed = this.zoomScale > 1.0;
    const cards = pages.map((url, idx) => `
      <div class="latex-pdf-page-card" data-page-num="${idx + 1}" style="width: ${Math.round(820 * this.zoomScale)}px; ${isZoomed ? 'max-width:none;' : 'max-width:100%;'}">
        <img class="latex-pdf-page-sheet" src="${url}" alt="Page ${idx + 1}" style="width:100%;height:auto;display:block;" />
      </div>
    `).join('');

    this.previewContainer.innerHTML = `
      <div class="pdf-rendered-pages">
        ${cards}
      </div>
    `;
    this.updatePageIndicator();
    this.setupScrollListener();
  }

  setupScrollListener() {
    if (!this.previewContainer) return;
    this.previewContainer.onscroll = () => {
      const cards = this.previewContainer.querySelectorAll('.latex-pdf-page-card');
      if (!cards || !cards.length) return;
      const containerRect = this.previewContainer.getBoundingClientRect();
      const midY = containerRect.top + (containerRect.height / 3);
      let currentPage = 1;
      cards.forEach(card => {
        const r = card.getBoundingClientRect();
        if (r.top <= midY) {
          const num = parseInt(card.dataset.pageNum || '1', 10);
          if (!isNaN(num)) currentPage = num;
        }
      });
      this.currentPageNum = currentPage;
      this.updatePageIndicator();
    };
  }

  buildLastSuccessfulBanner() {
    const elapsedMinutes = this.lastSuccessfulTimestamp
      ? Math.max(1, Math.round((new Date() - this.lastSuccessfulTimestamp) / 60000))
      : 1;
    return `
      <div class="last-successful-pdf-banner">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        <span>Showing last successful build · ${elapsedMinutes} min ago</span>
      </div>
    `;
  }

  updatePageIndicator() {
    const pageLabel = document.querySelector('#pdfPageLabel');
    if (pageLabel) {
      pageLabel.textContent = `Page ${this.currentPageNum || 1} of ${this.totalPageCount || 1}`;
    }
  }
}
