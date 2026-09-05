// Main Application Bootstrap & Lifecycle Orchestrator
import { $, $$ } from './utils/dom.js';
import { Poller } from './utils/poller.js';
import { api } from './api.js';
import { store } from './state.js';

import { HeaderComponent } from './components/Header.js';
import { DashboardComponent } from './components/Dashboard.js';
import { PapersTabComponent } from './components/PapersTab.js';
import { OutlineTabComponent } from './components/OutlineTab.js';
import { SummariesTabComponent } from './components/SummariesTab.js';
import { DraftReviewTabComponent } from './components/DraftReviewTab.js';
import { ChatTabComponent } from './components/ChatTab.js';
import { ModalsManager } from './components/Modals.js';

class SurveyApp {
  constructor() {
    this.viewDashboard = $('#viewDashboard');
    this.viewWorkspace = $('#viewWorkspace');
    this.tabBtns = $$('.tab-btn');
    this.tabPanes = $$('.tab-pane');

    // Paper Polling Controller
    this.paperPoller = new Poller(async () => {
      const papers = store.getState('papers') || [];
      const pending = papers.some(p => p.status === 'queued' || p.status === 'processing');
      if (pending) {
        await this.loadPapers();
        return true;
      }
      return false; // stop polling
    }, 2500);

    this.initComponents();
    this.setupTabNavigation();
    this.bootstrap();
  }

  initComponents() {
    // 1. Modals
    this.modals = new ModalsManager({
      onProjectCreated: (id) => this.openProject(id),
      onPaperUpdated: () => this.loadPapers(),
      onOutlineGenerated: () => this.loadOutline(),
      onDraftAudited: () => this.loadReviews()
    });

    // 2. Header
    this.header = new HeaderComponent({
      onBackToDashboard: () => this.closeProject(),
      onOpenSettings: () => this.modals.open('settings')
    });

    // 3. Dashboard
    this.dashboard = new DashboardComponent({
      onSelectProject: (id) => this.openProject(id),
      onNewProject: () => this.modals.open('newProject')
    });

    // 4. Tab Components
    this.papersTab = new PapersTabComponent({
      onEditPaper: (p) => this.modals.openEditPaper(p),
      onRefreshPapers: () => this.loadPapers(),
      onStartPolling: () => this.paperPoller.start()
    });

    this.outlineTab = new OutlineTabComponent({
      onOpenRegenModal: () => this.modals.open('regenOutline'),
      onOpenAddSectionModal: () => this.modals.open('addSection')
    });

    this.summariesTab = new SummariesTabComponent();

    this.draftReviewTab = new DraftReviewTabComponent({
      onOpenSubmitDraftModal: () => this.modals.open('submitDraft')
    });

    this.chatTab = new ChatTabComponent();
  }

  setupTabNavigation() {
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.tabBtns.forEach(b => b.classList.remove('active'));
        this.tabPanes.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.dataset.tab;
        $(`#${tabId}`)?.classList.add('active');
        store.setState('activeTab', tabId);
      });
    });
  }

  async bootstrap() {
    await this.loadSettings();
    await this.loadProjects();

    const savedProjectId = localStorage.getItem('spa_active_project_id');
    if (savedProjectId) {
      this.openProject(savedProjectId, false);
    }
  }

  async loadProjects() {
    try {
      const projects = await api.getProjects();
      store.setState('projects', projects);
    } catch (err) {
      console.error(err);
    }
  }

  async loadSettings() {
    try {
      const settings = await api.getSettings();
      store.setState('settings', settings);
      this.modals.populateSettings(settings);
    } catch (err) {
      console.error(err);
    }
  }

  async openProject(projectId, saveHistory = true) {
    try {
      const project = await api.getProject(projectId);
      store.setState('currentProject', project);

      if (saveHistory) {
        localStorage.setItem('spa_active_project_id', projectId);
      }

      // Switch to workspace view
      this.viewDashboard?.classList.add('hidden');
      this.viewWorkspace?.classList.remove('hidden');

      // Fetch tab data in parallel
      await Promise.allSettled([
        this.loadPapers(),
        this.loadOutline(),
        this.loadSummaries(),
        this.loadReviews(),
        this.loadChatHistory()
      ]);

      // Trigger ingestion polling if pending
      this.paperPoller.start();
    } catch (err) {
      console.error(err);
      localStorage.removeItem('spa_active_project_id');
      this.closeProject();
    }
  }

  closeProject() {
    this.paperPoller.stop();
    store.setState('currentProject', null);
    localStorage.removeItem('spa_active_project_id');

    this.viewWorkspace?.classList.add('hidden');
    this.viewDashboard?.classList.remove('hidden');
    this.loadProjects();
  }

  async loadPapers() {
    const project = store.getState('currentProject');
    if (!project) return;
    try {
      const papers = await api.getPapers(project.id);
      store.setState('papers', papers);
    } catch (err) {
      console.error(err);
    }
  }

  async loadOutline() {
    const project = store.getState('currentProject');
    if (!project) return;
    try {
      const outline = await api.getOutline(project.id);
      store.setState('outline', outline);
    } catch (err) {
      console.error(err);
    }
  }

  async loadSummaries() {
    const project = store.getState('currentProject');
    if (!project) return;
    try {
      const summaries = await api.getSummaries(project.id);
      store.setState('summaries', summaries);
    } catch (err) {
      console.error(err);
    }
  }

  async loadReviews() {
    const project = store.getState('currentProject');
    if (!project) return;
    try {
      const reviews = await api.getReviews(project.id);
      store.setState('reviews', reviews);
    } catch (err) {
      console.error(err);
    }
  }

  async loadChatHistory() {
    const project = store.getState('currentProject');
    if (!project) return;
    try {
      const msgs = await api.getChat(project.id);
      store.setState('chatMessages', msgs);
    } catch (err) {
      console.error(err);
    }
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new SurveyApp();
});
