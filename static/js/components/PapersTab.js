// Papers Tab component: Literature table, drag-drop upload, ingestion monitoring
import { $ } from '../utils/dom.js';
import { escapeHtml } from '../utils/formatters.js';
import { showToast } from '../utils/toast.js';
import { api } from '../api.js';
import { store } from '../state.js';

export class PapersTabComponent {
  constructor({ onEditPaper, onRefreshPapers, onStartPolling }) {
    this.onEditPaper = onEditPaper;
    this.onRefreshPapers = onRefreshPapers;
    this.onStartPolling = onStartPolling;

    this.tbody = $('#papersTableBody');
    this.emptyNotice = $('#noPapersNotice');
    this.countBadge = $('#tabPapersCount');
    this.dropZone = $('#paperDropZone');
    this.fileInput = $('#paperFileInput');
    this.queueContainer = $('#uploadQueueContainer');
    this.queueList = $('#uploadQueueList');

    this.init();
  }

  init() {
    // Dropzone events
    if (this.dropZone && this.fileInput) {
      this.dropZone.addEventListener('click', () => this.fileInput.click());
      this.fileInput.addEventListener('change', (e) => this.uploadFiles(e.target.files));

      ['dragenter', 'dragover'].forEach(name => {
        this.dropZone.addEventListener(name, (e) => {
          e.preventDefault();
          this.dropZone.classList.add('drag-over');
        });
      });

      ['dragleave', 'drop'].forEach(name => {
        this.dropZone.addEventListener(name, (e) => {
          e.preventDefault();
          this.dropZone.classList.remove('drag-over');
        });
      });

      this.dropZone.addEventListener('drop', (e) => {
        this.uploadFiles(e.dataTransfer.files);
      });
    }

    store.subscribe('papers', (papers) => this.render(papers));
  }

  render(papers = []) {
    if (!this.tbody) return;

    this.countBadge.textContent = papers.length;
    this.tbody.innerHTML = '';

    if (papers.length === 0) {
      this.emptyNotice?.classList.remove('hidden');
      return;
    }
    this.emptyNotice?.classList.add('hidden');

    papers.forEach(p => {
      const tr = document.createElement('tr');
      
      let statusBadge = '';
      if (p.status === 'ready') {
        statusBadge = `<span class="badge badge-active"><span class="pulse-dot"></span>Ready</span>`;
      } else if (p.status === 'processing') {
        statusBadge = `<span class="badge badge-warning"><span class="spin-dot"></span>Processing...</span>`;
      } else if (p.status === 'queued') {
        statusBadge = `<span class="badge badge-secondary">Queued</span>`;
      } else {
        statusBadge = `<span class="badge badge-critical" title="${escapeHtml(p.error_message || 'Failed')}">Failed</span>`;
      }

      const sectionsCount = p.sections ? p.sections.length : 0;
      const warningHtml = p.error_message && p.status === 'ready' ? 
        `<div style="font-size:11px; color:#f59e0b; margin-top:4px;">⚠️ ${escapeHtml(p.error_message)}</div>` : '';

      tr.innerHTML = `
        <td>
          <div class="paper-title-cell">${escapeHtml(p.title || p.original_name)}</div>
          <div class="paper-author-cell">${escapeHtml(p.authors || 'Unknown Authors')}</div>
          ${warningHtml}
        </td>
        <td>${p.page_count || 1} pages</td>
        <td>${statusBadge}</td>
        <td>${sectionsCount} detected</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-outline btn-sm btn-edit-paper" data-id="${p.id}" title="Edit Metadata">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button class="btn btn-outline btn-sm btn-delete-paper" data-id="${p.id}" title="Remove Paper">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      `;

      tr.querySelector('.btn-edit-paper').addEventListener('click', () => this.onEditPaper(p));
      tr.querySelector('.btn-delete-paper').addEventListener('click', () => this.handleDelete(p.id));
      this.tbody.appendChild(tr);
    });
  }

  async uploadFiles(fileList) {
    const project = store.getState('currentProject');
    if (!project || fileList.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < fileList.length; i++) {
      formData.append('files', fileList[i]);
    }

    this.queueContainer.classList.remove('hidden');
    this.queueList.innerHTML = `<div class="queue-item">Uploading ${fileList.length} file(s)...</div>`;

    try {
      const res = await api.uploadPapers(project.id, formData);
      this.queueList.innerHTML = '';
      res.uploaded.forEach(u => {
        const item = document.createElement('div');
        item.className = 'queue-item';
        item.innerHTML = `
          <span>${escapeHtml(u.original_name)}</span>
          <span class="badge ${u.status === 'failed' ? 'badge-critical' : (u.status === 'duplicate' ? 'badge-warning' : 'badge-info')}">
            ${u.status}: ${escapeHtml(u.error || 'Ingesting')}
          </span>
        `;
        this.queueList.appendChild(item);
      });

      showToast(`Uploaded ${res.uploaded.length} papers. Processing text...`, 'info');
      await this.onRefreshPapers();
      this.onStartPolling();

      setTimeout(() => {
        this.queueContainer.classList.add('hidden');
      }, 5000);
    } catch {
      this.queueContainer.classList.add('hidden');
    }
  }

  async handleDelete(paperId) {
    if (!confirm('Are you sure you want to remove this paper from your project corpus?')) return;
    try {
      await api.deletePaper(paperId);
      showToast('Paper removed', 'info');
      await this.onRefreshPapers();
    } catch (err) {
      console.error(err);
    }
  }
}
