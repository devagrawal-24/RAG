// Outline Tab component: Section tree, drag/reorder, inline edits, save & regenerate
import { $ } from '../utils/dom.js';
import { escapeHtml } from '../utils/formatters.js';
import { showToast } from '../utils/toast.js';
import { api } from '../api.js';
import { store } from '../state.js';

export class OutlineTabComponent {
  constructor({ onOpenRegenModal, onOpenAddSectionModal }) {
    this.onOpenRegenModal = onOpenRegenModal;
    this.onOpenAddSectionModal = onOpenAddSectionModal;

    this.container = $('#outlineSectionsList');
    this.btnSave = $('#btnSaveOutline');
    this.btnRegenModal = $('#btnRegenOutlineModal');
    this.btnAddSection = $('#btnAddSectionBtn');

    this.init();
  }

  init() {
    this.btnSave?.addEventListener('click', () => this.saveOutline());
    this.btnRegenModal?.addEventListener('click', () => this.onOpenRegenModal());
    this.btnAddSection?.addEventListener('click', () => this.onOpenAddSectionModal());

    store.subscribe('outline', (outline) => this.render(outline?.sections || []));
  }

  render(sections = []) {
    if (!this.container) return;
    this.container.innerHTML = '';

    if (sections.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon-glow">✦</div>
          <h3>No outline generated yet</h3>
          <p>Synthesize an authoritative survey outline structured directly around your uploaded literature.</p>
          <button id="btnGenerateInitialOutline" class="btn btn-primary">Generate Grounded Outline</button>
        </div>
      `;
      $('#btnGenerateInitialOutline')?.addEventListener('click', () => this.onOpenRegenModal());
      return;
    }

    sections.forEach((sec, idx) => {
      const card = document.createElement('div');
      card.className = 'outline-section-card';
      card.dataset.id = sec.id;
      
      const citations = (sec.suggested_citations || [])
        .map(c => `<span class="citation-chip">${escapeHtml(c)}</span>`)
        .join(' ');

      card.innerHTML = `
        <div class="sec-header">
          <div class="sec-title-group">
            <span class="sec-number">${escapeHtml(sec.number || (idx + 1).toString())}</span>
            <input type="text" class="sec-title-input" value="${escapeHtml(sec.title)}" placeholder="Section Title">
          </div>
          <div class="sec-actions">
            <button class="btn btn-outline btn-sm btn-move-up" title="Move Up" ${idx === 0 ? 'disabled' : ''}>▲</button>
            <button class="btn btn-outline btn-sm btn-move-down" title="Move Down" ${idx === sections.length - 1 ? 'disabled' : ''}>▼</button>
            <button class="btn btn-outline btn-sm btn-delete-sec" title="Delete Section" style="color:var(--critical);">✕</button>
          </div>
        </div>
        <textarea class="sec-desc-input" rows="2" placeholder="Section instructions and scope...">${escapeHtml(sec.description || '')}</textarea>
        ${citations ? `<div class="sec-citations-row"><span>Literature grounding:</span> ${citations}</div>` : ''}
      `;

      card.querySelector('.btn-move-up').addEventListener('click', () => this.moveSection(idx, -1));
      card.querySelector('.btn-move-down').addEventListener('click', () => this.moveSection(idx, 1));
      card.querySelector('.btn-delete-sec').addEventListener('click', () => this.deleteSection(idx));
      
      card.querySelector('.sec-title-input').addEventListener('input', (e) => {
        sec.title = e.target.value;
      });
      card.querySelector('.sec-desc-input').addEventListener('input', (e) => {
        sec.description = e.target.value;
      });

      this.container.appendChild(card);
    });
  }

  moveSection(index, direction) {
    const outline = store.getState('outline');
    const sections = [...(outline.sections || [])];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const temp = sections[index];
    sections[index] = sections[targetIndex];
    sections[targetIndex] = temp;
    
    sections.forEach((s, i) => s.number = (i + 1).toString());
    store.setState('outline', { ...outline, sections });
  }

  deleteSection(index) {
    if (!confirm('Remove this section from the outline?')) return;
    const outline = store.getState('outline');
    const sections = [...(outline.sections || [])];
    sections.splice(index, 1);
    sections.forEach((s, i) => s.number = (i + 1).toString());
    store.setState('outline', { ...outline, sections });
  }

  async saveOutline() {
    const project = store.getState('currentProject');
    const outline = store.getState('outline');
    if (!project) return;

    try {
      const res = await api.saveOutline(project.id, outline.sections || []);
      store.setState('outline', res);
      showToast('Outline saved successfully!', 'success');
    } catch (err) {
      console.error(err);
    }
  }
}
