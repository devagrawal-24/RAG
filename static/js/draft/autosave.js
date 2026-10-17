// autosave.js — Debounced auto-save controller with status cycling and version history

const HISTORY_KEY_PREFIX = 'survey_draft_history_';

export class AutoSaveManager {
  constructor(options = {}) {
    this.projectId = null;
    this.saveIndicator = options.saveIndicator || null;
    this.onSave = options.onSave || null;
    this.debounceMs = options.debounceMs || 800;
    this.timer = null;
    this.isSaving = false;
    this.hasUnsavedChanges = false;
  }

  setProjectId(id) {
    this.projectId = id;
  }

  markChanged() {
    this.hasUnsavedChanges = true;
    this.updateStatus('Unsaved changes');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.triggerSave(), this.debounceMs);
  }

  async triggerSave(manual = false) {
    if (!this.projectId || !this.onSave) return;
    if (this.isSaving && !manual) return;

    this.isSaving = true;
    this.updateStatus('Saving…');

    try {
      const savedData = await this.onSave();
      this.isSaving = false;
      this.hasUnsavedChanges = false;
      this.updateStatus('Saved');
      if (savedData && savedData.content) {
        this.pushHistory(this.projectId, savedData.content);
      }
    } catch (err) {
      this.isSaving = false;
      // Check if offline / network error
      if (!navigator.onLine || err.message?.includes('network') || err.message?.includes('fetch')) {
        this.updateStatus('Offline – saved locally');
        // Save to localStorage as backup
        const content = document.querySelector('#draftEditorTextarea')?.value || '';
        if (content) {
          localStorage.setItem(`offline_draft_${this.projectId}`, content);
        }
      } else {
        this.updateStatus('Unsaved changes');
      }
    }
  }

  updateStatus(stateText) {
    if (!this.saveIndicator) return;
    if (stateText === 'Saved') {
      this.saveIndicator.innerHTML = '<span class="pulse-dot"></span> Saved';
      this.saveIndicator.className = 'draft-save-pill saved';
    } else if (stateText === 'Saving…') {
      this.saveIndicator.innerHTML = '<span class="spin-dot"></span> Saving…';
      this.saveIndicator.className = 'draft-save-pill saving';
    } else if (stateText === 'Offline – saved locally') {
      this.saveIndicator.innerHTML = '<span class="pulse-dot" style="background:#f59e0b;"></span> Offline – saved locally';
      this.saveIndicator.className = 'draft-save-pill offline';
    } else {
      this.saveIndicator.innerHTML = '<span class="pulse-dot" style="background:#94a3b8;"></span> Unsaved changes';
      this.saveIndicator.className = 'draft-save-pill unsaved';
    }
  }

  pushHistory(projectId, content) {
    try {
      const key = `${HISTORY_KEY_PREFIX}${projectId}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      // Don't save duplicate consecutive entries
      if (existing.length > 0 && existing[0].content === content) return;

      const item = {
        timestamp: new Date().toISOString(),
        timeLabel: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content
      };
      existing.unshift(item);
      const capped = existing.slice(0, 10);
      localStorage.setItem(key, JSON.stringify(capped));
    } catch (e) {
      console.warn('Could not save draft history to localStorage', e);
    }
  }

  getHistory(projectId) {
    try {
      const key = `${HISTORY_KEY_PREFIX}${projectId}`;
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      return [];
    }
  }
}
