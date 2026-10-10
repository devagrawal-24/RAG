// MentionPopover.js - Document Reference Handler (@-Trigger) Popover
import { api } from '../api.js';
import { store } from '../state.js';
import { escapeHtml } from '../utils/formatters.js';

export class MentionPopover {
  constructor(inputElement) {
    this.input = inputElement;
    this.popover = null;
    this.selectedIndex = 0;
    this.matchingPapers = [];
    this.activeTriggerPos = -1;
    this.activeQuery = '';

    if (this.input) {
      this.init();
    }
  }

  init() {
    this.createPopoverElement();
    
    this.input.addEventListener('input', () => this.handleInput());
    this.input.addEventListener('keydown', (e) => this.handleKeyDown(e));
    this.input.addEventListener('blur', () => {
      setTimeout(() => this.hide(), 200);
    });
  }

  createPopoverElement() {
    this.popover = document.createElement('div');
    this.popover.className = 'mention-popover-menu hidden';
    document.body.appendChild(this.popover);
  }

  handleInput() {
    const val = this.input.value;
    const cursorPos = this.input.selectionStart;

    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
      if (/\s/.test(charBeforeAt) || lastAtIndex === 0) {
        const query = textBeforeCursor.slice(lastAtIndex + 1);
        if (!query.includes(']') && !query.includes('\n')) {
          this.activeTriggerPos = lastAtIndex;
          this.activeQuery = query;
          this.updatePopover(query);
          return;
        }
      }
    }

    this.hide();
  }

  async updatePopover(query) {
    const project = store.getState('currentProject');
    if (!project) {
      this.hide();
      return;
    }

    try {
      const papers = await api.searchPapers(project.id, query);
      this.matchingPapers = papers || [];
      this.selectedIndex = 0;
      this.render(query);
      this.positionPopover();
    } catch (err) {
      console.error('Mention search error:', err);
    }
  }

  render(query) {
    if (!this.popover) return;

    if (this.matchingPapers.length === 0) {
      this.popover.innerHTML = `
        <div class="mention-header">
          <span class="mention-title">@ Document Reference</span>
        </div>
        <div class="mention-empty-state">
          <p>No exact paper matches for <strong>"${escapeHtml(query)}"</strong></p>
          <span class="mention-hint">Type to refine search or select from database papers</span>
        </div>
      `;
      this.popover.classList.remove('hidden');
      return;
    }

    const isFallback = !query.trim();

    let itemsHtml = this.matchingPapers.map((paper, idx) => {
      const isSelected = idx === this.selectedIndex;
      const title = escapeHtml(paper.title || paper.original_name || 'Untitled Paper');
      const authors = escapeHtml(paper.authors || 'Unknown Authors');
      const snippetText = paper.key_findings || paper.abstract || '';
      const abstract = escapeHtml(snippetText.slice(0, 110));
      
      return `
        <div class="mention-item ${isSelected ? 'selected' : ''}" data-index="${idx}">
          <div class="mention-item-header">
            <span class="mention-paper-icon">📄</span>
            <span class="mention-paper-title">${title}</span>
          </div>
          <div class="mention-paper-authors">${authors}</div>
          ${abstract ? `<div class="mention-paper-snippet">${abstract}...</div>` : ''}
        </div>
      `;
    }).join('');

    this.popover.innerHTML = `
      <div class="mention-header">
        <span class="mention-title">@ Document Reference</span>
        <span class="mention-badge">${isFallback ? 'Database Papers' : 'Search Matches'}</span>
      </div>
      ${isFallback ? '<div class="mention-fallback-hint">Select a paper to reference or type to filter:</div>' : ''}
      <div class="mention-list">
        ${itemsHtml}
      </div>
    `;

    this.popover.classList.remove('hidden');

    const itemElements = this.popover.querySelectorAll('.mention-item');
    itemElements.forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const index = parseInt(el.dataset.index, 10);
        this.selectItem(index);
      });
    });
  }

  positionPopover() {
    if (!this.input || !this.popover) return;
    const rect = this.input.getBoundingClientRect();
    
    const popoverHeight = this.popover.offsetHeight || 240;
    const spaceAbove = rect.top;

    if (spaceAbove > popoverHeight + 10) {
      this.popover.style.top = `${window.scrollY + rect.top - popoverHeight - 8}px`;
    } else {
      this.popover.style.top = `${window.scrollY + rect.bottom + 8}px`;
    }

    this.popover.style.left = `${window.scrollX + rect.left}px`;
    this.popover.style.width = `${Math.max(rect.width, 360)}px`;
  }

  handleKeyDown(e) {
    if (this.popover.classList.contains('hidden')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex + 1) % Math.max(1, this.matchingPapers.length);
      this.render(this.activeQuery);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex - 1 + this.matchingPapers.length) % Math.max(1, this.matchingPapers.length);
      this.render(this.activeQuery);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (this.matchingPapers.length > 0) {
        e.preventDefault();
        this.selectItem(this.selectedIndex);
      }
    } else if (e.key === 'Escape') {
      this.hide();
    }
  }

  selectItem(index) {
    const paper = this.matchingPapers[index];
    if (!paper) return;

    const val = this.input.value;
    const title = paper.title || paper.original_name;
    const mentionTag = `@[${title}] `;

    const beforeAt = val.slice(0, this.activeTriggerPos);
    const textAfterCursor = val.slice(this.input.selectionStart);
    
    this.input.value = beforeAt + mentionTag + textAfterCursor;
    
    const newCursorPos = beforeAt.length + mentionTag.length;
    this.input.setSelectionRange(newCursorPos, newCursorPos);
    this.input.focus();

    this.hide();
  }

  hide() {
    if (this.popover) {
      this.popover.classList.add('hidden');
    }
  }
}
