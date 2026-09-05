// Chat Tab component: Scoped AI Co-Pilot with literature evidence cards & quick chips
import { $, $$ } from '../utils/dom.js';
import { escapeHtml, formatMarkdown } from '../utils/formatters.js';
import { showToast } from '../utils/toast.js';
import { api } from '../api.js';
import { store } from '../state.js';

export class ChatTabComponent {
  constructor() {
    this.container = $('#chatMessagesContainer');
    this.form = $('#chatForm');
    this.input = $('#chatInput');
    this.btnClear = $('#btnClearChat');
    this.quickChips = $$('.quick-chip');

    this.init();
  }

  init() {
    this.form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.sendMessage(this.input.value);
    });

    this.btnClear?.addEventListener('click', () => this.clearChat());

    this.quickChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const prompt = chip.dataset.prompt;
        if (prompt) this.sendMessage(prompt);
      });
    });

    store.subscribe('chatMessages', (messages) => this.render(messages || []));
  }

  render(messages = []) {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="chat-message assistant-message">
        <div class="message-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path><rect x="4" y="8" width="16" height="12" rx="2"></rect><circle cx="9" cy="14" r="1"></circle><circle cx="15" cy="14" r="1"></circle></svg>
        </div>
        <div class="message-content">
          <p>Welcome! I'm your grounded survey co-pilot. I have full context of your uploaded literature, generated outline, and review audit. Ask me anything about synthesizing papers, building taxonomy tables, or structuring your survey arguments.</p>
        </div>
      </div>
    `;

    messages.forEach(m => this.appendMessage(m));
    this.scrollToBottom();
  }

  appendMessage(msg) {
    const div = document.createElement('div');
    const isAssistant = msg.role === 'assistant';
    div.className = `chat-message ${isAssistant ? 'assistant-message' : 'user-message'}`;

    let citationsHtml = '';
    if (msg.citations && msg.citations.length > 0) {
      const cards = msg.citations.map(c => `
        <div class="citation-card">
          <div class="citation-header">
            <span class="citation-title">[${escapeHtml(c.paper_title)}]</span>
            <span class="citation-meta">p. ${c.page_num || 1} • ${escapeHtml(c.section_title || 'Section')}</span>
          </div>
          <div class="citation-quote">"${escapeHtml(c.snippet)}"</div>
        </div>
      `).join('');
      citationsHtml = `<div class="chat-citations"><div class="citations-label">VERIFIABLE LITERATURE GROUNDING:</div>${cards}</div>`;
    }

    div.innerHTML = `
      <div class="message-avatar">
        ${isAssistant ? 
          `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path><rect x="4" y="8" width="16" height="12" rx="2"></rect></svg>` :
          `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
      </div>
      <div class="message-content">
        ${formatMarkdown(msg.content)}
        ${citationsHtml}
      </div>
    `;
    this.container.appendChild(div);
    this.scrollToBottom();
  }

  async sendMessage(text) {
    const project = store.getState('currentProject');
    const trimmed = text.trim();
    if (!project || !trimmed) return;

    // Optimistic user bubble
    this.appendMessage({ role: 'user', content: trimmed, citations: [] });
    if (this.input) this.input.value = '';

    // Typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-message assistant-message typing-indicator-msg';
    typingDiv.innerHTML = `
      <div class="message-avatar"><span class="spin-dot"></span></div>
      <div class="message-content"><p>Retrieving evidence from literature corpus...</p></div>
    `;
    this.container.appendChild(typingDiv);
    this.scrollToBottom();

    try {
      const response = await api.sendMessage(project.id, trimmed);
      typingDiv.remove();
      this.appendMessage(response);
    } catch {
      typingDiv.remove();
    }
  }

  async clearChat() {
    const project = store.getState('currentProject');
    if (!project) return;
    if (!confirm('Clear this chat conversation?')) return;

    try {
      await api.clearChat(project.id);
      store.setState('chatMessages', []);
      showToast('Chat history cleared', 'info');
    } catch (err) {
      console.error(err);
    }
  }

  scrollToBottom() {
    if (this.container) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }
}
