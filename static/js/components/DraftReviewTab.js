// Draft Review Auditor Tab component: Health scores, readability metrics, overlap risk, issue filters
import { $, $$ } from '../utils/dom.js';
import { escapeHtml } from '../utils/formatters.js';
import { store } from '../state.js';

export class DraftReviewTabComponent {
  constructor({ onOpenSubmitDraftModal }) {
    this.onOpenSubmitDraftModal = onOpenSubmitDraftModal;

    this.versionSelect = $('#reviewVersionSelect');
    this.metricHealthScore = $('#metricHealthScore');
    this.metricReadability = $('#metricReadability');
    this.metricReadabilityGrade = $('#metricReadabilityGrade');
    this.metricOverlapPct = $('#metricOverlapPct');
    this.metricOverlapRisk = $('#metricOverlapRisk');
    this.badgeCritCount = $('#badgeCritCount');
    this.badgeWarnCount = $('#badgeWarnCount');
    this.issuesList = $('#reviewIssuesList');
    this.btnOpenSubmitModal = $('#btnSubmitDraftModal');
    this.filterChips = $$('.filter-chip');

    this.currentFilter = 'all';

    this.init();
  }

  init() {
    this.btnOpenSubmitModal?.addEventListener('click', () => this.onOpenSubmitDraftModal());

    this.versionSelect?.addEventListener('change', (e) => {
      const reviews = store.getState('reviews') || [];
      const selected = reviews.find(r => r.id === e.target.value);
      if (selected) {
        store.setState('currentReview', selected);
        this.renderReview(selected, this.currentFilter);
      }
    });

    this.filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.currentFilter = chip.dataset.filter || 'all';
        const currentReview = store.getState('currentReview');
        if (currentReview) {
          this.renderReview(currentReview, this.currentFilter);
        }
      });
    });

    store.subscribe('reviews', (reviews) => this.populateVersions(reviews || []));
  }

  populateVersions(reviews = []) {
    if (!this.versionSelect) return;
    this.versionSelect.innerHTML = '';

    if (reviews.length === 0) {
      this.metricHealthScore.textContent = '--';
      this.metricReadability.textContent = '--';
      this.metricReadabilityGrade.textContent = 'No draft reviewed';
      this.metricOverlapPct.textContent = '--';
      this.metricOverlapRisk.textContent = 'Local paper overlap';
      this.badgeCritCount.textContent = '0 Critical';
      this.badgeWarnCount.textContent = '0 Warnings';

      this.issuesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon-glow">✦</div>
          <h3>No draft reviewed yet</h3>
          <p>Submit your draft (PDF, DOCX, Markdown, or text) to run automated structural, citation, readability, and overlap diagnostics.</p>
          <button id="btnEmptyReview" class="btn btn-primary">Submit Draft for Review</button>
        </div>
      `;
      $('#btnEmptyReview')?.addEventListener('click', () => this.onOpenSubmitDraftModal());
      return;
    }

    reviews.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `Version ${r.version}: ${r.draft_title} (${new Date(r.created_at).toLocaleDateString()})`;
      this.versionSelect.appendChild(opt);
    });

    const activeReview = reviews[0];
    store.setState('currentReview', activeReview);
    this.renderReview(activeReview, this.currentFilter);
  }

  renderReview(review, filter = 'all') {
    if (!review) return;

    // Health Score calculation
    const critCount = review.issues.filter(i => i.severity === 'critical').length;
    const warnCount = review.issues.filter(i => i.severity === 'warning').length;
    const overlapPct = review.overlap ? (review.overlap.overall_overlap_pct || 0) : 0;
    const health = Math.max(10, 100 - (critCount * 12) - (warnCount * 4) - Math.min(Math.floor(overlapPct), 30));

    this.metricHealthScore.textContent = `${health}/100`;
    this.metricHealthScore.style.color = health >= 75 ? 'var(--success)' : (health >= 50 ? 'var(--warning)' : 'var(--critical)');
    
    const read = review.readability || {};
    this.metricReadability.textContent = `FRE: ${read.flesch_reading_ease || 0}`;
    this.metricReadabilityGrade.textContent = `Fog: ${read.gunning_fog || 0} (${read.grade_level || 'N/A'})`;

    this.metricOverlapPct.textContent = `${overlapPct}%`;
    this.metricOverlapRisk.textContent = `${review.overlap?.risk_level || 'Clean'} Overlap Risk`;

    this.badgeCritCount.textContent = `${critCount} Critical`;
    this.badgeWarnCount.textContent = `${warnCount} Warnings`;

    // Render Issues List
    this.issuesList.innerHTML = '';
    const filtered = review.issues.filter(i => {
      if (filter === 'all') return true;
      return i.severity === filter;
    });

    if (filtered.length === 0) {
      this.issuesList.innerHTML = `
        <div class="empty-card-placeholder" style="background:var(--bg-surface); padding:24px; border-radius:var(--radius-md); text-align:center;">
          <p>No issues found matching filter '${filter}'.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(iss => {
      const card = document.createElement('div');
      card.className = `issue-card severity-${iss.severity}`;
      const badgeClass = iss.severity === 'critical' ? 'badge-critical' : (iss.severity === 'warning' ? 'badge-warning' : 'badge-info');

      card.innerHTML = `
        <div class="issue-card-header">
          <div class="issue-title-group">
            <span class="badge ${badgeClass}">${iss.severity.toUpperCase()}</span>
            <strong>${escapeHtml(iss.title)}</strong>
          </div>
          <span class="issue-location">${escapeHtml(iss.location || 'Document')}</span>
        </div>
        <p class="issue-desc">${escapeHtml(iss.description)}</p>
        <div class="issue-suggestion">
          <strong>Suggested Action:</strong> ${escapeHtml(iss.suggestion || 'Review and revise text.')}
        </div>
      `;
      this.issuesList.appendChild(card);
    });
  }
}
