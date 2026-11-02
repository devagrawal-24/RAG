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

    // SAM (Survey Assessment Metrics) Elements
    this.samCard = $('#samBenchmarkCard');
    this.samCompositeTier = $('#samCompositeTier');
    this.samCompositeScore = $('#samCompositeScore');
    this.samRScore = $('#samRScore');
    this.samRBar = $('#samRBar');
    this.samRCoverage = $('#samRCoverage');
    this.samRDensity = $('#samRDensity');
    this.samOScore = $('#samOScore');
    this.samOBar = $('#samOBar');
    this.samOPillars = $('#samOPillars');
    this.samODepth = $('#samODepth');
    this.samCScore = $('#samCScore');
    this.samCBar = $('#samCBar');
    this.samCSynthesis = $('#samCSynthesis');
    this.samCTable = $('#samCTable');

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

      if (this.samCompositeTier) this.samCompositeTier.textContent = 'Tier --';
      if (this.samCompositeScore) this.samCompositeScore.textContent = '-- / 100';
      if (this.samRScore) this.samRScore.textContent = '--';
      if (this.samRBar) this.samRBar.style.width = '0%';
      if (this.samRCoverage) this.samRCoverage.textContent = '--%';
      if (this.samRDensity) this.samRDensity.textContent = '-- / 1k w';
      if (this.samOScore) this.samOScore.textContent = '--';
      if (this.samOBar) this.samOBar.style.width = '0%';
      if (this.samOPillars) this.samOPillars.textContent = '-- / 6';
      if (this.samODepth) this.samODepth.textContent = '--';
      if (this.samCScore) this.samCScore.textContent = '--';
      if (this.samCBar) this.samCBar.style.width = '0%';
      if (this.samCSynthesis) this.samCSynthesis.textContent = '--';
      if (this.samCTable) this.samCTable.textContent = '--';

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

    // Render SurveyBench SAM Benchmark Metrics
    const sam = review.sam || {};
    const samR = sam.sam_r || {};
    const samO = sam.sam_o || {};
    const samC = sam.sam_c || {};

    if (this.samCompositeTier) this.samCompositeTier.textContent = sam.tier || 'Benchmark Pending';
    if (this.samCompositeScore) this.samCompositeScore.textContent = `${sam.composite != null ? sam.composite : '--'} / 100`;

    if (this.samRScore) this.samRScore.textContent = `${samR.score != null ? samR.score : '--'}`;
    if (this.samRBar) this.samRBar.style.width = `${Math.min(samR.score || 0, 100)}%`;
    if (this.samRCoverage) this.samRCoverage.textContent = `${samR.coverage_pct != null ? samR.coverage_pct : '--'}%`;
    if (this.samRDensity) this.samRDensity.textContent = `${samR.citation_density != null ? samR.citation_density : '--'} / 1k w`;

    if (this.samOScore) this.samOScore.textContent = `${samO.score != null ? samO.score : '--'}`;
    if (this.samOBar) this.samOBar.style.width = `${Math.min(samO.score || 0, 100)}%`;
    if (this.samOPillars) this.samOPillars.textContent = `${samO.pillars_count != null ? samO.pillars_count : '--'} / 6`;
    if (this.samODepth) this.samODepth.textContent = `${samO.hierarchy_depth || '--'}`;

    if (this.samCScore) this.samCScore.textContent = `${samC.score != null ? samC.score : '--'}`;
    if (this.samCBar) this.samCBar.style.width = `${Math.min(samC.score || 0, 100)}%`;
    if (this.samCSynthesis) this.samCSynthesis.textContent = `${samC.comparative_links != null ? samC.comparative_links : '--'} links`;
    if (this.samCTable) this.samCTable.textContent = `${samC.table_status || (samC.has_table ? 'Present' : 'Missing')}`;

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
