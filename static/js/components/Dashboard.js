// Dashboard component managing project list and empty states
import { $ } from '../utils/dom.js';
import { escapeHtml, formatDate } from '../utils/formatters.js';
import { store } from '../state.js';

export class DashboardComponent {
  constructor({ onSelectProject, onNewProject }) {
    this.onSelectProject = onSelectProject;
    this.onNewProject = onNewProject;

    this.viewDashboard = $('#viewDashboard');
    this.projectListGrid = $('#projectListGrid');
    this.dashboardEmptyState = $('#dashboardEmptyState');
    this.projectCountBadge = $('#projectCountBadge');
    this.btnNewProjectModal = $('#btnNewProjectModal');
    this.btnEmptyCreate = $('#btnEmptyCreate');

    this.init();
  }

  init() {
    this.btnNewProjectModal?.addEventListener('click', () => this.onNewProject());
    this.btnEmptyCreate?.addEventListener('click', () => this.onNewProject());

    store.subscribe('projects', (projects) => this.render(projects));
  }

  render(projects = []) {
    if (!this.projectListGrid) return;

    this.projectCountBadge.textContent = `${projects.length} Project${projects.length === 1 ? '' : 's'}`;
    this.projectListGrid.innerHTML = '';

    if (projects.length === 0) {
      this.dashboardEmptyState.classList.remove('hidden');
      return;
    }
    this.dashboardEmptyState.classList.add('hidden');

    projects.forEach(p => {
      const card = document.createElement('div');
      card.className = 'project-card';
      const lastUpdated = formatDate(p.updated_at);
      
      card.innerHTML = `
        <div class="card-header">
          <h3>${escapeHtml(p.name)}</h3>
          <span class="badge badge-active">${p.status || 'Active'}</span>
        </div>
        <p class="card-topic">${escapeHtml(p.topic || 'No topic specified')}</p>
        <div class="card-stats">
          <div class="card-stat-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
            ${p.paper_count} Paper${p.paper_count === 1 ? '' : 's'}
          </div>
          <div class="card-stat-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line></svg>
            ${p.has_outline ? 'Outline Ready' : 'No Outline'}
          </div>
          <div class="card-stat-item">
            Updated: ${lastUpdated}
          </div>
        </div>
      `;
      card.addEventListener('click', () => this.onSelectProject(p.id));
      this.projectListGrid.appendChild(card);
    });
  }
}
