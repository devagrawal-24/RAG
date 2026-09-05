// Unified Modals Manager: Handles lifecycle, backdrop events, and submissions for all dialogs
import { $, $$ } from '../utils/dom.js';
import { showToast } from '../utils/toast.js';
import { api } from '../api.js';
import { store } from '../state.js';

export class ModalsManager {
  constructor({ onProjectCreated, onPaperUpdated, onOutlineGenerated, onDraftAudited }) {
    this.onProjectCreated = onProjectCreated;
    this.onPaperUpdated = onPaperUpdated;
    this.onOutlineGenerated = onOutlineGenerated;
    this.onDraftAudited = onDraftAudited;

    // Modals
    this.modals = {
      newProject: $('#modalNewProject'),
      editPaper: $('#modalEditPaper'),
      regenOutline: $('#modalRegenOutline'),
      addSection: $('#modalAddSection'),
      submitDraft: $('#modalSubmitDraft'),
      settings: $('#modalSettings')
    };

    this.init();
  }

  init() {
    // Universal close buttons & backdrop click
    $$('.modal-close-btn, .modal-cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => this.closeAll());
    });

    Object.values(this.modals).forEach(modal => {
      modal?.addEventListener('click', (e) => {
        if (e.target === modal) this.closeAll();
      });
    });

    // Escape key listener
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeAll();
    });

    // Form handlers
    this.setupNewProjectForm();
    this.setupEditPaperForm();
    this.setupRegenOutlineForm();
    this.setupAddSectionForm();
    this.setupSubmitDraftForm();
    this.setupSettingsForm();
  }

  open(modalKey) {
    const modal = this.modals[modalKey];
    if (modal) {
      modal.classList.remove('hidden');
      const firstInput = modal.querySelector('input, textarea, select');
      firstInput?.focus();
    }
  }

  close(modalKey) {
    this.modals[modalKey]?.classList.add('hidden');
  }

  closeAll() {
    Object.values(this.modals).forEach(m => m?.classList.add('hidden'));
  }

  // 1. New Project Form
  setupNewProjectForm() {
    const form = $('#formNewProject');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#inputProjectName').value.trim();
      const topic = $('#inputProjectTopic').value.trim();
      const desc = $('#inputProjectDesc').value.trim();
      if (!name) return;

      try {
        const project = await api.createProject({ name, topic, description: desc });
        this.close('newProject');
        form.reset();
        showToast(`Project '${project.name}' created!`, 'success');
        this.onProjectCreated(project.id);
      } catch (err) {
        console.error(err);
      }
    });
  }

  // 2. Edit Paper Form
  setupEditPaperForm() {
    const form = $('#formEditPaper');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const paperId = $('#editPaperId').value;
      const title = $('#editPaperTitle').value.trim();
      const authors = $('#editPaperAuthors').value.trim();
      const abstract = $('#editPaperAbstract').value.trim();

      try {
        await api.updatePaper(paperId, { title, authors, abstract });
        this.close('editPaper');
        showToast('Paper metadata updated', 'success');
        this.onPaperUpdated();
      } catch (err) {
        console.error(err);
      }
    });
  }

  openEditPaper(paper) {
    $('#editPaperId').value = paper.id;
    $('#editPaperTitle').value = paper.title || paper.original_name;
    $('#editPaperAuthors').value = paper.authors || '';
    $('#editPaperAbstract').value = paper.abstract || '';
    this.open('editPaper');
  }

  // 3. Regenerate Outline Form
  setupRegenOutlineForm() {
    const form = $('#formRegenOutline');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const project = store.getState('currentProject');
      if (!project) return;

      const guidance = $('#inputOutlineGuidance').value.trim();
      showToast('Synthesizing papers and generating grounded outline...', 'info');
      
      try {
        const res = await api.generateOutline(project.id, guidance);
        store.setState('outline', res);
        this.close('regenOutline');
        showToast(`Outline Version ${res.version} generated!`, 'success');
        this.onOutlineGenerated?.();
      } catch (err) {
        console.error(err);
      }
    });
  }

  // 4. Add Section Form
  setupAddSectionForm() {
    const form = $('#formAddSection');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const outline = store.getState('outline');
      const sections = [...(outline?.sections || [])];

      const num = $('#inputSecNum').value.trim() || (sections.length + 1).toString();
      const title = $('#inputSecTitle').value.trim();
      const desc = $('#inputSecDesc').value.trim();
      if (!title) return;

      sections.push({
        id: `sec-${Date.now()}`,
        number: num,
        title: title,
        description: desc,
        suggested_citations: []
      });

      store.setState('outline', { ...outline, sections });
      this.close('addSection');
      form.reset();
    });
  }

  // 5. Submit Draft Form
  setupSubmitDraftForm() {
    const form = $('#formSubmitDraft');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const project = store.getState('currentProject');
      if (!project) return;

      const title = $('#inputDraftTitle').value.trim();
      const text = $('#inputDraftText').value.trim();
      const fileInput = $('#inputDraftFile');

      if (!text && fileInput.files.length === 0) {
        showToast('Please upload a draft file or paste text.', 'warning');
        return;
      }

      const formData = new FormData();
      formData.append('draft_title', title || 'Survey Draft');
      if (text) formData.append('draft_text', text);
      if (fileInput.files.length > 0) formData.append('file', fileInput.files[0]);

      showToast('Auditing draft: checking structure, citations, flow, and overlap...', 'info');
      try {
        const review = await api.submitDraft(project.id, formData);
        this.close('submitDraft');
        form.reset();
        showToast(`Draft Version ${review.version} audited successfully!`, 'success');
        this.onDraftAudited?.();
      } catch (err) {
        console.error(err);
      }
    });
  }

  // 6. Settings Form
  setupSettingsForm() {
    const providerSelect = $('#settingProvider');
    providerSelect?.addEventListener('change', (e) => {
      this.updateSettingsVisibility(e.target.value);
    });

    const tempSlider = $('#settingTemperature');
    tempSlider?.addEventListener('input', (e) => {
      $('#tempValue').textContent = e.target.value;
    });

    const form = $('#formSettings');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const updated = {
        llm_provider: $('#settingProvider').value,
        openrouter_api_key: $('#settingOpenRouterKey').value.trim(),
        openrouter_model: $('#settingOpenRouterModel').value.trim(),
        openai_api_key: $('#settingOpenAIKey').value.trim(),
        openai_model: $('#settingOpenAIModel').value.trim(),
        ollama_base_url: $('#settingOllamaUrl').value.trim(),
        ollama_model: $('#settingOllamaModel').value.trim(),
        temperature: $('#settingTemperature').value
      };

      try {
        const res = await api.saveSettings(updated);
        store.setState('settings', res);
        this.close('settings');
        showToast('Settings saved successfully', 'success');
      } catch (err) {
        console.error(err);
      }
    });
  }

  updateSettingsVisibility(provider) {
    $('#groupOpenRouter')?.classList.toggle('hidden', provider !== 'openrouter');
    $('#groupOpenAI')?.classList.toggle('hidden', provider !== 'openai');
    $('#groupOllama')?.classList.toggle('hidden', provider !== 'ollama');
  }

  populateSettings(settings) {
    if (!settings) return;
    if ($('#settingProvider')) $('#settingProvider').value = settings.llm_provider || 'heuristic';
    if ($('#settingOpenRouterKey')) $('#settingOpenRouterKey').value = settings.openrouter_api_key || '';
    if ($('#settingOpenRouterModel')) $('#settingOpenRouterModel').value = settings.openrouter_model || 'anthropic/claude-3.5-sonnet';
    if ($('#settingOpenAIKey')) $('#settingOpenAIKey').value = settings.openai_api_key || '';
    if ($('#settingOpenAIModel')) $('#settingOpenAIModel').value = settings.openai_model || 'gpt-4o-mini';
    if ($('#settingOllamaUrl')) $('#settingOllamaUrl').value = settings.ollama_base_url || 'http://localhost:11434';
    if ($('#settingOllamaModel')) $('#settingOllamaModel').value = settings.ollama_model || 'llama3';
    if ($('#settingTemperature')) $('#settingTemperature').value = settings.temperature || '0.3';
    if ($('#tempValue')) $('#tempValue').textContent = settings.temperature || '0.3';
    this.updateSettingsVisibility(settings.llm_provider || 'heuristic');
  }
}
