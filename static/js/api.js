// Centralized REST API Service
import { showToast } from './utils/toast.js';

export async function request(url, options = {}) {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      let errData;
      try {
        errData = await res.json();
      } catch {
        errData = { detail: res.statusText || 'Server Error' };
      }
      throw new Error(errData.detail || 'An unexpected error occurred');
    }
    return await res.json();
  } catch (err) {
    showToast(err.message, 'error');
    throw err;
  }
}

export const api = {
  // Projects
  getProjects: () => request('/api/projects'),
  getProject: (id) => request(`/api/projects/${id}`),
  createProject: (data) => request('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deleteProject: (id) => request(`/api/projects/${id}`, {
    method: 'DELETE'
  }),

  // Papers
  getPapers: (projectId) => request(`/api/projects/${projectId}/papers`),
  searchPapers: (projectId, q = '') => request(`/api/projects/${projectId}/papers/search?q=${encodeURIComponent(q)}`),
  uploadPapers: (projectId, formData) => request(`/api/projects/${projectId}/papers`, {
    method: 'POST',
    body: formData
  }),
  updatePaper: (paperId, data) => request(`/api/papers/${paperId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),
  deletePaper: (paperId) => request(`/api/papers/${paperId}`, {
    method: 'DELETE'
  }),

  // Outline
  getOutline: (projectId) => request(`/api/projects/${projectId}/outline`),
  generateOutline: (projectId, guidance = '') => request(`/api/projects/${projectId}/outline/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guidance })
  }),
  saveOutline: (projectId, sections) => request(`/api/projects/${projectId}/outline`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sections })
  }),

  // Summaries
  getSummaries: (projectId) => request(`/api/projects/${projectId}/summaries`),
  generateSummaries: (projectId) => request(`/api/projects/${projectId}/summaries/generate`, {
    method: 'POST'
  }),

  // Reviews & Draft Studio
  getReviews: (projectId) => request(`/api/projects/${projectId}/reviews`),
  submitDraft: (projectId, formData) => request(`/api/projects/${projectId}/review`, {
    method: 'POST',
    body: formData
  }),
  compileDraft: (projectId, latex_source, title, bib = '', paper_size = 'letter', signal = null) => request(`/api/projects/${projectId}/draft/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latex_source, title, bib, paper_size }),
    signal
  }),
  compileDirect: (tex, bib = '', paper = 'letter', signal = null) => request(`/api/compile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tex, bib, options: { paper } }),
    signal
  }),
  getCompileHealth: () => request(`/api/compile/health`),
  getProjectBibtex: (projectId) => request(`/api/projects/${projectId}/references.bib`),
  getDraft: (projectId) => request(`/api/projects/${projectId}/draft`),
  saveDraft: (projectId, data) => request(`/api/projects/${projectId}/draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }),

  // Chat
  getChat: (projectId) => request(`/api/projects/${projectId}/chat`),
  sendMessage: (projectId, message) => request(`/api/projects/${projectId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  }),
  clearChat: (projectId) => request(`/api/projects/${projectId}/chat`, {
    method: 'DELETE'
  }),

  // Settings
  getSettings: () => request('/api/settings'),
  saveSettings: (settings) => request('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings)
  })
};
