// Chat Tab component: Scoped AI Co-Pilot with literature evidence cards & quick chips
import { $, $$ } from '../utils/dom.js';
import { escapeHtml, formatMarkdown } from '../utils/formatters.js';
import { showToast } from '../utils/toast.js';
import { api } from '../api.js';
import { store } from '../state.js';
import { MentionPopover } from './MentionPopover.js';

export class ChatTabComponent {
  constructor() {
    this.container = $('#chatMessagesContainer');
    this.form = $('#chatForm');
    this.input = $('#chatInput');
    this.btnClear = $('#btnClearChat');
    this.quickChips = $$('.quick-chip');
    this.isWaitingResponse = false;

    this.init();
  }

  init() {
    if (this.input) {
      this.mentionPopover = new MentionPopover(this.input);
    }
    this.form?.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.sendMessage(this.input.value);
    });

    this.btnClear?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.clearChat();
    });

    this.quickChips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const prompt = chip.dataset.prompt;
        if (prompt) this.sendMessage(prompt);
      });
    });

    store.subscribe('chatMessages', (messages) => {
      if (!this.isWaitingResponse) {
        this.render(messages || []);
      }
    });
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
    this.container.appendChild(div);
    this.scrollToBottom();
  }

  async sendMessage(text) {
    const project = store.getState('currentProject');
    const trimmed = text.trim();
    if (!project || !trimmed) return;

    const userMsg = { role: 'user', content: trimmed, citations: [] };
    this.appendMessage(userMsg);
    if (this.input) this.input.value = '';

    this.isWaitingResponse = true;

    // Buffer indicator
    const bufferDiv = document.createElement('div');
    bufferDiv.className = 'chat-message assistant-message chat-buffer-msg';
    bufferDiv.id = 'chatTypingIndicator';
    bufferDiv.innerHTML = `
      <div class="message-avatar"><span class="spin-dot"></span></div>
      <div class="message-content buffer-content">
        <div class="chat-buffer-dots">
          <span></span><span></span><span></span>
        </div>
        <span class="buffer-text">Consulting literature corpus & LLM...</span>
      </div>
    `;
    this.container?.appendChild(bufferDiv);
    this.scrollToBottom();

    try {
      const response = await api.sendMessage(project.id, trimmed);
      this.isWaitingResponse = false;
      bufferDiv.remove();
      this.appendMessage(response);
      const currentMsgs = store.getState('chatMessages') || [];
      store.setState('chatMessages', [...currentMsgs, userMsg, response]);
    } catch (err) {
      this.isWaitingResponse = false;
      bufferDiv.remove();
      const errorDiv = document.createElement('div');
      errorDiv.className = 'chat-message assistant-message error-message';
      errorDiv.innerHTML = `
        <div class="message-avatar" style="background:var(--critical);">✕</div>
        <div class="message-content" style="border-color:#fca5a5; background:#fff5f5; color:#b91c1c;">
          <p>Failed to get response from AI Co-Pilot: ${escapeHtml(err.message || 'Check settings and API key')}</p>
        </div>
      `;
      this.container?.appendChild(errorDiv);
      this.scrollToBottom();
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
