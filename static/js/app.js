// Survey Paper Assistant — Client Application Logic
(function() {
  // State
  let state = {
    currentProject: null,
    activeTab: 'tabPapers',
    papers: [],
    outline: { sections: [], version: 0 },
    summaries: [],
    reviews: [],
    currentReview: null,
    chatMessages: [],
    settings: {},
    pollingInterval: null
  };

  // DOM Elements
  const viewDashboard = document.getElementById('viewDashboard');
  const viewWorkspace = document.getElementById('viewWorkspace');
  const projectListGrid = document.getElementById('projectListGrid');
  const dashboardEmptyState = document.getElementById('dashboardEmptyState');
  const projectCountBadge = document.getElementById('projectCountBadge');
  
  const projectHeaderBreadcrumb = document.getElementById('projectHeaderBreadcrumb');
  const headerProjectName = document.getElementById('headerProjectName');
  const headerProjectStatus = document.getElementById('headerProjectStatus');
  const workspaceActions = document.getElementById('workspaceActions');
  const btnBackToDashboard = document.getElementById('btnBackToDashboard');
  const btnExportProject = document.getElementById('btnExportProject');
  const btnOpenSettings = document.getElementById('btnOpenSettings');

  // Modals
  const modalNewProject = document.getElementById('modalNewProject');
  const modalEditPaper = document.getElementById('modalEditPaper');
  const modalRegenOutline = document.getElementById('modalRegenOutline');
  const modalAddSection = document.getElementById('modalAddSection');
  const modalSubmitDraft = document.getElementById('modalSubmitDraft');
  const modalSettings = document.getElementById('modalSettings');
  const toastContainer = document.getElementById('toastContainer');

  // Initialization
  async function init() {
    setupEventListeners();
    await loadSettings();
    await loadProjects();

    // Check if there is an active project stored
    const savedProjectId = localStorage.getItem('spa_active_project_id');
    if (savedProjectId) {
      openProject(savedProjectId, false);
    }
  }

  // Toast notifications
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // API helper
  async function api(url, options = {}) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        let errData;
        try {
          errData = await res.json();
        } catch {
          errData = { detail: res.statusText };
        }
        throw new Error(errData.detail || 'An unexpected error occurred');
      }
      return await res.json();
    } catch (err) {
      showToast(err.message, 'error');
      throw err;
    }
  }

  // ----------------- Projects & Navigation -----------------
  async function loadProjects() {
    try {
      const projects = await api('/api/projects');
      renderProjectsList(projects);
    } catch (err) {
      console.error(err);
    }
  }

  function renderProjectsList(projects) {
    projectCountBadge.textContent = `${projects.length} Project${projects.length === 1 ? '' : 's'}`;
    projectListGrid.innerHTML = '';

    if (projects.length === 0) {
      dashboardEmptyState.classList.remove('hidden');
      return;
    }
    dashboardEmptyState.classList.add('hidden');

    projects.forEach(p => {
      const card = document.createElement('div');
      card.className = 'project-card';
      const lastUpdated = new Date(p.updated_at).toLocaleDateString();
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
      card.addEventListener('click', () => openProject(p.id));
      projectListGrid.appendChild(card);
    });
  }

  async function openProject(projectId, saveHistory = true) {
    try {
      const p = await api(`/api/projects/${projectId}`);
      state.currentProject = p;
      if (saveHistory) {
        localStorage.setItem('spa_active_project_id', projectId);
      }

      // Update workspace header
      headerProjectName.textContent = p.name;
      projectHeaderBreadcrumb.classList.remove('hidden');
      workspaceActions.classList.remove('hidden');
      btnBackToDashboard.classList.remove('hidden');

      // Switch views
      viewDashboard.classList.add('hidden');
      viewWorkspace.classList.remove('hidden');

      // Load all tab data
      await loadPapers();
      await loadOutline();
      await loadSummaries();
      await loadReviews();
      await loadChatHistory();

      // Start polling for pending paper ingestion
      startPaperPolling();
    } catch (err) {
      console.error(err);
      localStorage.removeItem('spa_active_project_id');
      closeProject();
    }
  }

  function closeProject() {
    stopPaperPolling();
    state.currentProject = null;
    localStorage.removeItem('spa_active_project_id');
    projectHeaderBreadcrumb.classList.add('hidden');
    workspaceActions.classList.add('hidden');
    btnBackToDashboard.classList.add('hidden');

    viewWorkspace.classList.add('hidden');
    viewDashboard.classList.remove('hidden');
    loadProjects();
  }

  // ----------------- Papers Tab -----------------
  async function loadPapers() {
    if (!state.currentProject) return;
    try {
      const papers = await api(`/api/projects/${state.currentProject.id}/papers`);
      state.papers = papers;
      document.getElementById('tabPapersCount').textContent = papers.length;
      renderPapersTable(papers);
    } catch (err) {
      console.error(err);
    }
  }

  function renderPapersTable(papers) {
    const tbody = document.getElementById('papersTableBody');
    const emptyNotice = document.getElementById('noPapersNotice');
    tbody.innerHTML = '';

    if (papers.length === 0) {
      emptyNotice.classList.remove('hidden');
      return;
    }
    emptyNotice.classList.add('hidden');

    papers.forEach(p => {
      const tr = document.createElement('tr');
      
      let statusBadge = '';
      if (p.status === 'ready') {
        statusBadge = `<span class="badge badge-active">Ready</span>`;
      } else if (p.status === 'processing') {
        statusBadge = `<span class="badge badge-warning">Processing...</span>`;
      } else if (p.status === 'queued') {
        statusBadge = `<span class="badge badge-secondary">Queued</span>`;
      } else {
        statusBadge = `<span class="badge badge-critical" title="${escapeHtml(p.error_message || 'Failed')}">Failed</span>`;
      }

      const sectionsCount = p.sections ? p.sections.length : 0;
      const warningHtml = p.error_message && p.status === 'ready' ? 
        `<div style="font-size:11px; color:#f59e0b; margin-top:4px;">⚠️ ${escapeHtml(p.error_message)}</div>` : '';

      tr.innerHTML = `
        <td>
          <div class="paper-title-cell">${escapeHtml(p.title || p.original_name)}</div>
          <div class="paper-author-cell">${escapeHtml(p.authors || 'Unknown Authors')}</div>
          ${warningHtml}
        </td>
        <td>${p.page_count || 1} pages</td>
        <td>${statusBadge}</td>
        <td>${sectionsCount} detected</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-outline btn-sm btn-edit-paper" data-id="${p.id}" title="Edit Metadata">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button class="btn btn-outline btn-sm btn-delete-paper" data-id="${p.id}" title="Remove Paper">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      `;

      tr.querySelector('.btn-edit-paper').addEventListener('click', () => openEditPaperModal(p));
      tr.querySelector('.btn-delete-paper').addEventListener('click', () => handleDeletePaper(p.id));
      tbody.appendChild(tr);
    });
  }

  async function uploadFiles(fileList) {
    if (!state.currentProject || fileList.length === 0) return;

    const formData = new FormData();
    for (let i = 0; i < fileList.length; i++) {
      formData.append('files', fileList[i]);
    }

    const queueContainer = document.getElementById('uploadQueueContainer');
    const queueList = document.getElementById('uploadQueueList');
    queueContainer.classList.remove('hidden');
    queueList.innerHTML = `<div class="queue-item">Uploading ${fileList.length} file(s)...</div>`;

    try {
      const res = await api(`/api/projects/${state.currentProject.id}/papers`, {
        method: 'POST',
        body: formData
      });

      queueList.innerHTML = '';
      res.uploaded.forEach(u => {
        const item = document.createElement('div');
        item.className = 'queue-item';
        item.innerHTML = `
          <span>${escapeHtml(u.original_name)}</span>
          <span class="badge ${u.status === 'failed' ? 'badge-critical' : (u.status === 'duplicate' ? 'badge-warning' : 'badge-info')}">
            ${u.status}: ${escapeHtml(u.error || 'Ingesting')}
          </span>
        `;
        queueList.appendChild(item);
      });

      showToast(`Uploaded ${res.uploaded.length} papers. Processing text...`, 'info');
      await loadPapers();
      startPaperPolling();

      setTimeout(() => {
        queueContainer.classList.add('hidden');
      }, 5000);
    } catch (err) {
      queueContainer.classList.add('hidden');
    }
  }

  function startPaperPolling() {
    stopPaperPolling();
    state.pollingInterval = setInterval(async () => {
      const pending = state.papers.some(p => p.status === 'queued' || p.status === 'processing');
      if (pending) {
        await loadPapers();
      } else {
        stopPaperPolling();
      }
    }, 2500);
  }

  function stopPaperPolling() {
    if (state.pollingInterval) {
      clearInterval(state.pollingInterval);
      state.pollingInterval = null;
    }
  }

  function openEditPaperModal(paper) {
    document.getElementById('editPaperId').value = paper.id;
    document.getElementById('editPaperTitle').value = paper.title || paper.original_name;
    document.getElementById('editPaperAuthors').value = paper.authors || '';
    document.getElementById('editPaperAbstract').value = paper.abstract || '';
    modalEditPaper.classList.remove('hidden');
  }

  async function handleDeletePaper(paper_id) {
    if (!confirm('Are you sure you want to remove this paper from your project corpus?')) return;
    try {
      await api(`/api/papers/${paper_id}`, { method: 'DELETE' });
      showToast('Paper removed', 'info');
      await loadPapers();
    } catch (err) {
      console.error(err);
    }
  }

  // ----------------- Outline Tab -----------------
  async function loadOutline() {
    if (!state.currentProject) return;
    try {
      const out = await api(`/api/projects/${state.currentProject.id}/outline`);
      state.outline = out;
      renderOutline(out.sections || []);
    } catch (err) {
      console.error(err);
    }
  }

  function renderOutline(sections) {
    const container = document.getElementById('outlineSectionsList');
    container.innerHTML = '';

    if (sections.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No outline generated yet</h3>
          <p>Generate a survey outline structured strictly around your uploaded literature.</p>
          <button id="btnGenerateInitialOutline" class="btn btn-primary">Generate Grounded Outline</button>
        </div>
      `;
      document.getElementById('btnGenerateInitialOutline').addEventListener('click', () => handleRegenerateOutline(''));
      return;
    }

    sections.forEach((sec, idx) => {
      const card = document.createElement('div');
      card.className = 'outline-section-card';
      card.dataset.id = sec.id;
      
      const citations = (sec.suggested_citations || []).map(c => `<span class="citation-chip">${escapeHtml(c)}</span>`).join(' ');

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
        ${citations ? `<div class="sec-citations-row"><span>Suggested literature to cite:</span> ${citations}</div>` : ''}
      `;

      // Up / Down / Delete events
      card.querySelector('.btn-move-up').addEventListener('click', () => moveSection(idx, -1));
      card.querySelector('.btn-move-down').addEventListener('click', () => moveSection(idx, 1));
      card.querySelector('.btn-delete-sec').addEventListener('click', () => deleteSection(idx));
      
      // Bind inline updates
      card.querySelector('.sec-title-input').addEventListener('input', (e) => {
        sec.title = e.target.value;
      });
      card.querySelector('.sec-desc-input').addEventListener('input', (e) => {
        sec.description = e.target.value;
      });

      container.appendChild(card);
    });
  }

  function moveSection(index, direction) {
    const sections = state.outline.sections;
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sections.length) return;
    const temp = sections[index];
    sections[index] = sections[targetIndex];
    sections[targetIndex] = temp;
    // Update numbering
    sections.forEach((s, i) => s.number = (i + 1).toString());
    renderOutline(sections);
  }

  function deleteSection(index) {
    if (!confirm('Remove this section from the outline?')) return;
    state.outline.sections.splice(index, 1);
    state.outline.sections.forEach((s, i) => s.number = (i + 1).toString());
    renderOutline(state.outline.sections);
  }

  async function handleSaveOutline() {
    if (!state.currentProject) return;
    try {
      const res = await api(`/api/projects/${state.currentProject.id}/outline`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: state.outline.sections })
      });
      state.outline = res;
      showToast('Outline saved successfully!', 'success');
    } catch (err) {
      console.error(err);
    }
  }

  async function handleRegenerateOutline(guidance = '') {
    if (!state.currentProject) return;
    showToast('Synthesizing papers and generating outline...', 'info');
    try {
      const res = await api(`/api/projects/${state.currentProject.id}/outline/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guidance })
      });
      state.outline = res;
      renderOutline(res.sections || []);
      showToast(`Outline Version ${res.version} generated!`, 'success');
      modalRegenOutline.classList.add('hidden');
    } catch (err) {
      console.error(err);
    }
  }

  // ----------------- Summaries Tab -----------------
  async function loadSummaries() {
    if (!state.currentProject) return;
    try {
      const summaries = await api(`/api/projects/${state.currentProject.id}/summaries`);
      state.summaries = summaries;
      renderSummaries(summaries);
    } catch (err) {
      console.error(err);
    }
  }

  function renderSummaries(summaries) {
    const combined = summaries.find(s => s.summary_type === 'combined');
    const combinedContainer = document.getElementById('combinedSummaryContent');
    if (combined && combined.synthesis_content) {
      combinedContainer.innerHTML = formatMarkdown(combined.synthesis_content);
    } else {
      combinedContainer.innerHTML = `
        <div class="empty-card-placeholder">
          <p>Click <strong>"Generate / Refresh Summaries"</strong> to synthesize your uploaded literature into common ground, methodological divergences, and research gaps.</p>
        </div>
      `;
    }

    const individual = summaries.filter(s => s.summary_type === 'individual');
    const indGrid = document.getElementById('individualSummariesGrid');
    indGrid.innerHTML = '';

    if (individual.length === 0) {
      indGrid.innerHTML = `<p class="text-muted" style="grid-column:1/-1;">No individual paper summaries generated yet.</p>`;
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
      indGrid.appendChild(card);
    });
  }

  async function handleGenerateSummaries() {
    if (!state.currentProject) return;
    if (state.papers.length === 0) {
      showToast('Please upload at least one research paper first.', 'warning');
      return;
    }
    showToast('Extracting 4-pillar summaries & cross-paper synthesis...', 'info');
    try {
      const summaries = await api(`/api/projects/${state.currentProject.id}/summaries/generate`, {
        method: 'POST'
      });
      state.summaries = summaries;
      renderSummaries(summaries);
      showToast('Summaries generated successfully!', 'success');
    } catch (err) {
      console.error(err);
    }
  }

  // ----------------- Draft Review Auditor Tab -----------------
  async function loadReviews() {
    if (!state.currentProject) return;
    try {
      const reviews = await api(`/api/projects/${state.currentProject.id}/reviews`);
      state.reviews = reviews;
      renderReviews(reviews);
    } catch (err) {
      console.error(err);
    }
  }

  function renderReviews(reviews) {
    const versionSelect = document.getElementById('reviewVersionSelect');
    versionSelect.innerHTML = '';

    if (reviews.length === 0) {
      document.getElementById('metricHealthScore').textContent = '--';
      document.getElementById('metricReadability').textContent = '--';
      document.getElementById('metricReadabilityGrade').textContent = 'No draft reviewed';
      document.getElementById('metricOverlapPct').textContent = '--';
      document.getElementById('metricOverlapRisk').textContent = 'Local paper overlap';
      document.getElementById('badgeCritCount').textContent = '0 Critical';
      document.getElementById('badgeWarnCount').textContent = '0 Warnings';
      document.getElementById('reviewIssuesList').innerHTML = `
        <div class="empty-state">
          <h3>No draft reviewed yet</h3>
          <p>Submit your draft (PDF, DOCX, Markdown, or text) to run automated structural, citation, readability, and overlap diagnostics.</p>
          <button id="btnEmptyReview" class="btn btn-primary">Submit Draft for Review</button>
        </div>
      `;
      document.getElementById('btnEmptyReview')?.addEventListener('click', () => modalSubmitDraft.classList.remove('hidden'));
      return;
    }

    reviews.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = `Version ${r.version}: ${r.draft_title} (${new Date(r.created_at).toLocaleDateString()})`;
      versionSelect.appendChild(opt);
    });

    state.currentReview = reviews[0];
    renderSelectedReview(state.currentReview);
  }

  function renderSelectedReview(review, filter = 'all') {
    if (!review) return;

    // Health Score calculation if not saved directly
    const critCount = review.issues.filter(i => i.severity === 'critical').length;
    const warnCount = review.issues.filter(i => i.severity === 'warning').length;
    const overlapPct = review.overlap ? (review.overlap.overall_overlap_pct || 0) : 0;
    const health = Math.max(10, 100 - (critCount * 12) - (warnCount * 4) - Math.min(Math.floor(overlapPct), 30));

    document.getElementById('metricHealthScore').textContent = `${health}/100`;
    document.getElementById('metricHealthScore').style.color = health >= 75 ? 'var(--success)' : (health >= 50 ? 'var(--warning)' : 'var(--critical)');
    
    const read = review.readability || {};
    document.getElementById('metricReadability').textContent = `FRE: ${read.flesch_reading_ease || 0}`;
    document.getElementById('metricReadabilityGrade').textContent = `Fog: ${read.gunning_fog || 0} (${read.grade_level || 'N/A'})`;

    document.getElementById('metricOverlapPct').textContent = `${overlapPct}%`;
    document.getElementById('metricOverlapRisk').textContent = `${review.overlap?.risk_level || 'Clean'} Overlap Risk`;

    document.getElementById('badgeCritCount').textContent = `${critCount} Critical`;
    document.getElementById('badgeWarnCount').textContent = `${warnCount} Warnings`;

    // Render Issues List
    const issuesContainer = document.getElementById('reviewIssuesList');
    issuesContainer.innerHTML = '';

    const filtered = review.issues.filter(i => {
      if (filter === 'all') return true;
      return i.severity === filter;
    });

    if (filtered.length === 0) {
      issuesContainer.innerHTML = `
        <div class="empty-card-placeholder" style="background:var(--bg-surface); padding:24px; border-radius:var(--radius-md); text-align:center;">
          <p>No issues found for the selected filter '${filter}'.</p>
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
      issuesContainer.appendChild(card);
    });
  }

  async function handleSubmitDraft(formData) {
    if (!state.currentProject) return;
    showToast('Auditing draft: checking structure, citations, flow, and overlap...', 'info');
    try {
      const review = await api(`/api/projects/${state.currentProject.id}/review`, {
        method: 'POST',
        body: formData
      });
      modalSubmitDraft.classList.add('hidden');
      showToast(`Draft Version ${review.version} audited successfully!`, 'success');
      await loadReviews();
    } catch (err) {
      console.error(err);
    }
  }

  // ----------------- AI Co-Pilot Tab -----------------
  async function loadChatHistory() {
    if (!state.currentProject) return;
    try {
      const msgs = await api(`/api/projects/${state.currentProject.id}/chat`);
      state.chatMessages = msgs;
      renderChatMessages(msgs);
    } catch (err) {
      console.error(err);
    }
  }

  function renderChatMessages(messages) {
    const container = document.getElementById('chatMessagesContainer');
    // Keep initial welcome message
    container.innerHTML = `
      <div class="chat-message assistant-message">
        <div class="message-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path><rect x="4" y="8" width="16" height="12" rx="2"></rect><circle cx="9" cy="14" r="1"></circle><circle cx="15" cy="14" r="1"></circle></svg>
        </div>
        <div class="message-content">
          <p>Welcome! I'm your grounded survey co-pilot. I have full context of your uploaded literature, generated outline, and review audit. Ask me anything about synthesizing papers, building taxonomy tables, or structuring your survey arguments.</p>
        </div>
      </div>
    `;

    messages.forEach(m => {
      appendChatMessage(m);
    });
    container.scrollTop = container.scrollHeight;
  }

  function appendChatMessage(msg) {
    const container = document.getElementById('chatMessagesContainer');
    const div = document.createElement('div');
    const isAssistant = msg.role === 'assistant';
    div.className = `chat-message ${isAssistant ? 'assistant-message' : 'user-message'}`;

    div.innerHTML = `
      <div class="message-avatar">
        ${isAssistant ? 
          `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path><rect x="4" y="8" width="16" height="12" rx="2"></rect></svg>` :
          `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
      </div>
      <div class="message-content">
        ${formatMarkdown(msg.content)}
      </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  async function handleSendChatMessage(text) {
    if (!state.currentProject || !text.trim()) return;

    // Append optimistic user message
    appendChatMessage({ role: 'user', content: text, citations: [] });
    document.getElementById('chatInput').value = '';

    // Show temporary typing indicator
    const container = document.getElementById('chatMessagesContainer');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-message assistant-message';
    typingDiv.id = 'chatTypingIndicator';
    typingDiv.innerHTML = `
      <div class="message-avatar">...</div>
      <div class="message-content"><p>Retrieving evidence from literature corpus...</p></div>
    `;
    container.appendChild(typingDiv);
    container.scrollTop = container.scrollHeight;

    try {
      const res = await api(`/api/projects/${state.currentProject.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      typingDiv.remove();
      appendChatMessage(res);
    } catch (err) {
      typingDiv.remove();
    }
  }

  // ----------------- Settings Modal -----------------
  async function loadSettings() {
    try {
      const s = await api('/api/settings');
      state.settings = s;
      document.getElementById('settingProvider').value = s.llm_provider || 'heuristic';
      document.getElementById('settingOpenRouterKey').value = s.openrouter_api_key || '';
      document.getElementById('settingOpenRouterModel').value = s.openrouter_model || 'anthropic/claude-3.5-sonnet';
      document.getElementById('settingOpenAIKey').value = s.openai_api_key || '';
      document.getElementById('settingOpenAIModel').value = s.openai_model || 'gpt-4o-mini';
      document.getElementById('settingOllamaUrl').value = s.ollama_base_url || 'http://localhost:11434';
      document.getElementById('settingOllamaModel').value = s.ollama_model || 'llama3';
      document.getElementById('settingTemperature').value = s.temperature || '0.3';
      document.getElementById('tempValue').textContent = s.temperature || '0.3';
      updateSettingsVisibility(s.llm_provider || 'heuristic');
    } catch (err) {
      console.error(err);
    }
  }

  function updateSettingsVisibility(provider) {
    document.getElementById('groupOpenRouter').classList.toggle('hidden', provider !== 'openrouter');
    document.getElementById('groupOpenAI').classList.toggle('hidden', provider !== 'openai');
    document.getElementById('groupOllama').classList.toggle('hidden', provider !== 'ollama');
  }

  // ----------------- Event Listeners -----------------
  function setupEventListeners() {
    // Top Bar Actions
    btnBackToDashboard.addEventListener('click', closeProject);
    document.querySelector('.logo-group').addEventListener('click', closeProject);
    btnOpenSettings.addEventListener('click', () => modalSettings.classList.remove('hidden'));
    btnExportProject.addEventListener('click', () => {
      if (state.currentProject) {
        window.open(`/api/projects/${state.currentProject.id}/export?format=markdown`, '_blank');
      }
    });

    // Dashboard Buttons
    document.getElementById('btnNewProjectModal').addEventListener('click', () => modalNewProject.classList.remove('hidden'));
    document.getElementById('btnEmptyCreate').addEventListener('click', () => modalNewProject.classList.remove('hidden'));

    // Modal Close buttons
    document.querySelectorAll('.modal-close-btn, .modal-cancel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modalNewProject.classList.add('hidden');
        modalEditPaper.classList.add('hidden');
        modalRegenOutline.classList.add('hidden');
        modalAddSection.classList.add('hidden');
        modalSubmitDraft.classList.add('hidden');
        modalSettings.classList.add('hidden');
      });
    });

    // New Project Form
    document.getElementById('formNewProject').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('inputProjectName').value.trim();
      const topic = document.getElementById('inputProjectTopic').value.trim();
      const desc = document.getElementById('inputProjectDesc').value.trim();
      if (!name) return;

      try {
        const p = await api('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, topic, description: desc })
        });
        modalNewProject.classList.add('hidden');
        document.getElementById('formNewProject').reset();
        showToast(`Project '${p.name}' created!`, 'success');
        openProject(p.id);
      } catch (err) {
        console.error(err);
      }
    });

    // Edit Paper Form
    document.getElementById('formEditPaper').addEventListener('submit', async (e) => {
      e.preventDefault();
      const paperId = document.getElementById('editPaperId').value;
      const title = document.getElementById('editPaperTitle').value.trim();
      const authors = document.getElementById('editPaperAuthors').value.trim();
      const abstract = document.getElementById('editPaperAbstract').value.trim();

      try {
        await api(`/api/papers/${paperId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, authors, abstract })
        });
        modalEditPaper.classList.add('hidden');
        showToast('Paper metadata updated', 'success');
        await loadPapers();
      } catch (err) {
        console.error(err);
      }
    });

    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.dataset.tab;
        document.getElementById(tabId).classList.add('active');
        state.activeTab = tabId;
      });
    });

    // Drag and Drop Upload
    const dropZone = document.getElementById('paperDropZone');
    const fileInput = document.getElementById('paperFileInput');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => uploadFiles(e.target.files));

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
      });
    });
    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
      });
    });
    dropZone.addEventListener('drop', (e) => {
      uploadFiles(e.dataTransfer.files);
    });

    // Outline Actions
    document.getElementById('btnSaveOutline').addEventListener('click', handleSaveOutline);
    document.getElementById('btnRegenOutlineModal').addEventListener('click', () => modalRegenOutline.classList.remove('hidden'));
    document.getElementById('formRegenOutline').addEventListener('submit', (e) => {
      e.preventDefault();
      const guidance = document.getElementById('inputOutlineGuidance').value.trim();
      handleRegenerateOutline(guidance);
    });

    document.getElementById('btnAddSectionBtn').addEventListener('click', () => modalAddSection.classList.remove('hidden'));
    document.getElementById('formAddSection').addEventListener('submit', (e) => {
      e.preventDefault();
      const num = document.getElementById('inputSecNum').value.trim() || (state.outline.sections.length + 1).toString();
      const title = document.getElementById('inputSecTitle').value.trim();
      const desc = document.getElementById('inputSecDesc').value.trim();
      if (!title) return;

      state.outline.sections.push({
        id: `sec-${Date.now()}`,
        number: num,
        title: title,
        description: desc,
        suggested_citations: []
      });
      renderOutline(state.outline.sections);
      modalAddSection.classList.add('hidden');
      document.getElementById('formAddSection').reset();
    });

    // Summaries Actions
    document.getElementById('btnGenerateSummaries').addEventListener('click', handleGenerateSummaries);
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.subtab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.subtab).classList.add('active');
      });
    });

    // Review Actions
    document.getElementById('btnSubmitDraftModal').addEventListener('click', () => modalSubmitDraft.classList.remove('hidden'));
    document.getElementById('formSubmitDraft').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('inputDraftTitle').value.trim();
      const text = document.getElementById('inputDraftText').value.trim();
      const fileInput = document.getElementById('inputDraftFile');

      if (!text && fileInput.files.length === 0) {
        showToast('Please upload a file or paste draft text.', 'warning');
        return;
      }

      const formData = new FormData();
      formData.append('draft_title', title || 'Survey Draft');
      if (text) formData.append('draft_text', text);
      if (fileInput.files.length > 0) formData.append('file', fileInput.files[0]);

      await handleSubmitDraft(formData);
    });

    document.getElementById('reviewVersionSelect').addEventListener('change', (e) => {
      const rev = state.reviews.find(r => r.id === e.target.value);
      if (rev) {
        state.currentReview = rev;
        renderSelectedReview(rev);
      }
    });

    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        if (state.currentReview) {
          renderSelectedReview(state.currentReview, chip.dataset.filter);
        }
      });
    });

    // Chat Actions
    document.getElementById('chatForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('chatInput');
      handleSendChatMessage(input.value);
    });

    document.getElementById('btnClearChat').addEventListener('click', async () => {
      if (!state.currentProject) return;
      if (!confirm('Clear this chat conversation?')) return;
      try {
        await api(`/api/projects/${state.currentProject.id}/chat`, { method: 'DELETE' });
        renderChatMessages([]);
        showToast('Chat history cleared', 'info');
      } catch (err) {
        console.error(err);
      }
    });

    document.querySelectorAll('.quick-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        handleSendChatMessage(chip.dataset.prompt);
      });
    });

    // Settings Form
    document.getElementById('settingProvider').addEventListener('change', (e) => {
      updateSettingsVisibility(e.target.value);
    });

    document.getElementById('settingTemperature').addEventListener('input', (e) => {
      document.getElementById('tempValue').textContent = e.target.value;
    });

    document.getElementById('formSettings').addEventListener('submit', async (e) => {
      e.preventDefault();
      const updated = {
        llm_provider: document.getElementById('settingProvider').value,
        openrouter_api_key: document.getElementById('settingOpenRouterKey').value.trim(),
        openrouter_model: document.getElementById('settingOpenRouterModel').value.trim(),
        openai_api_key: document.getElementById('settingOpenAIKey').value.trim(),
        openai_model: document.getElementById('settingOpenAIModel').value.trim(),
        ollama_base_url: document.getElementById('settingOllamaUrl').value.trim(),
        ollama_model: document.getElementById('settingOllamaModel').value.trim(),
        temperature: document.getElementById('settingTemperature').value
      };
      try {
        const res = await api('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updated)
        });
        state.settings = res;
        modalSettings.classList.add('hidden');
        showToast('Settings saved successfully', 'success');
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Helpers
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    // Headings
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    // Bold & italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Line breaks into paragraphs
    html = html.split('\n\n').map(para => {
      if (para.startsWith('<h') || para.startsWith('<ul')) return para;
      return `<p>${para.replace(/\n/g, '<br>')}</p>`;
    }).join('');
    return html;
  }

  // Start app
  document.addEventListener('DOMContentLoaded', init);
})();
