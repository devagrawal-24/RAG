// Header component managing navigation, project breadcrumb, and workspace actions
import { $, $$ } from '../utils/dom.js';
import { store } from '../state.js';

export class HeaderComponent {
  constructor({ onBackToDashboard, onOpenSettings }) {
    this.onBackToDashboard = onBackToDashboard;
    this.onOpenSettings = onOpenSettings;

    this.projectHeaderBreadcrumb = $('#projectHeaderBreadcrumb');
    this.headerProjectName = $('#headerProjectName');
    this.headerProjectStatus = $('#headerProjectStatus');
    this.workspaceActions = $('#workspaceActions');
    this.btnBackToDashboard = $('#btnBackToDashboard');
    this.btnExportProject = $('#btnExportProject');
    this.btnOpenSettings = $('#btnOpenSettings');
    this.logoGroup = $('.logo-group');

    this.init();
  }

  init() {
    this.logoGroup?.addEventListener('click', () => this.onBackToDashboard());
    this.btnBackToDashboard?.addEventListener('click', () => this.onBackToDashboard());
    this.btnOpenSettings?.addEventListener('click', () => this.onOpenSettings());
    
    this.btnExportProject?.addEventListener('click', () => {
      const project = store.getState('currentProject');
      if (project) {
        window.open(`/api/projects/${project.id}/export?format=markdown`, '_blank');
      }
    });

    store.subscribe('currentProject', (project) => this.render(project));
  }

  render(project) {
    if (project) {
      this.headerProjectName.textContent = project.name;
      this.projectHeaderBreadcrumb?.classList.remove('hidden');
      this.workspaceActions?.classList.remove('hidden');
      this.btnBackToDashboard?.classList.remove('hidden');
    } else {
      this.projectHeaderBreadcrumb?.classList.add('hidden');
      this.workspaceActions?.classList.add('hidden');
      this.btnBackToDashboard?.classList.add('hidden');
    }
  }
}
