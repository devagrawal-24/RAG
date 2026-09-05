// Summaries Tab component: Cross-Paper Synthesis & 4-Pillar Decompositions
import { $, $$ } from '../utils/dom.js';
import { escapeHtml, formatMarkdown } from '../utils/formatters.js';
import { showToast } from '../utils/toast.js';
import { api } from '../api.js';
import { store } from '../state.js';

export class SummariesTabComponent {
  constructor() {
    this.btnGenerate = $('#btnGenerateSummaries');
    this.combinedContainer = $('#combinedSummaryContent');
    this.individualGrid = $('#individualSummariesGrid');
    this.subTabBtns = $$('.sub-tab-btn');
    this.subTabPanes = $$('.subtab-pane');

    this.init();
  }

  init() {
    this.btnGenerate?.addEventListener('click', () => this.generateSummaries());

    this.subTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.subTabBtns.forEach(b => b.classList.remove('active'));
        this.subTabPanes.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        $(`#${btn.dataset.subtab}`)?.classList.add('active');
      });
    });

    store.subscribe('summaries', (summaries) => this.render(summaries || []));
  }

  render(summaries = []) {
    // 1. Cross-paper synthesis
    const combined = summaries.find(s => s.summary_type === 'combined');
    if (this.combinedContainer) {
      if (combined && combined.synthesis_content) {
        this.combinedContainer.innerHTML = formatMarkdown(combined.synthesis_content);
      } else {
        this.combinedContainer.innerHTML = `
          <div class="empty-card-placeholder">
            <p>Click <strong>"Generate / Refresh Summaries"</strong> to synthesize your uploaded literature into common ground, methodological divergences, and research gaps.</p>
          </div>
        `;
      }
    }

    // 2. Individual 4-pillar cards
    const individual = summaries.filter(s => s.summary_type === 'individual');
    if (this.individualGrid) {
      this.individualGrid.innerHTML = '';
      if (individual.length === 0) {
        this.individualGrid.innerHTML = `<p class="text-muted" style="grid-column:1/-1;">No individual paper summaries generated yet.</p>`;
        return;
      }

      individual.forEach(s => {
        const card = document.createElement('div');
        card.className = 'paper-summary-card';
        card.innerHTML = `
          <div class="paper-summary-header">
            <h3>${escapeHtml(s.paper_title || 'Paper Summary')}</h3>
            <span class="badge badge-info">4 Pillars</span>
          </div>
          <div class="summary-pillar">
            <div class="pillar-title">1. Problem Statement</div>
            <div class="pillar-content">${escapeHtml(s.problem || 'Not specified')}</div>
          </div>
          <div class="summary-pillar">
            <div class="pillar-title">2. Proposed Methodology</div>
            <div class="pillar-content">${escapeHtml(s.methodology || 'Not specified')}</div>
          </div>
          <div class="summary-pillar">
            <div class="pillar-title">3. Key Empirical Findings</div>
            <div class="pillar-content">${escapeHtml(s.findings || 'Not specified')}</div>
          </div>
          <div class="summary-pillar">
            <div class="pillar-title">4. Limitations & Validity</div>
            <div class="pillar-content">${escapeHtml(s.limitations || 'Not specified')}</div>
          </div>
        `;
        this.individualGrid.appendChild(card);
      });
    }
  }

  async generateSummaries() {
    const project = store.getState('currentProject');
    const papers = store.getState('papers') || [];
    if (!project) return;
    if (papers.length === 0) {
      showToast('Please upload at least one research paper first.', 'warning');
      return;
    }

    showToast('Extracting 4-pillar summaries & cross-paper synthesis...', 'info');
    try {
      const summaries = await api.generateSummaries(project.id);
      store.setState('summaries', summaries);
      showToast('Summaries generated successfully!', 'success');
    } catch (err) {
      console.error(err);
    }
  }
}
