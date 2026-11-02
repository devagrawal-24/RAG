// Floating AI Research Co-Pilot Component (Slide-Over Drawer & Pop-up Trigger)
import { $, $$ } from '../utils/dom.js';
import { escapeHtml, formatMarkdown } from '../utils/formatters.js';
import { showToast } from '../utils/toast.js';
import { api } from '../api.js';
import { store } from '../state.js';
import { MentionPopover } from './MentionPopover.js';

export class FloatingChatComponent {
  constructor() {
    this.wrapper = $('#floatingChatWrapper');
    this.triggerBtn = $('#btnFloatingChatTrigger');
    this.drawer = $('#floatingChatDrawer');
    this.closeBtn = $('#btnCloseFloatingChat');
    this.btnClear = $('#btnClearFloatingChat');
    this.subtitleEl = $('#floatingChatSubtitle');
    this.iconOpen = this.triggerBtn?.querySelector('.icon-chat-open');
    this.iconClose = this.triggerBtn?.querySelector('.icon-chat-close');
    this.quickChips = $$('.docked-chip');
    this.container = $('#dockedChatMessages');
    this.form = $('#dockedChatForm');
    this.input = $('#dockedChatInput');
    this.btnSend = $('#btnSendDockedChat');
    this.isWaitingResponse = false;
    this.isOpen = false;

    this.init();
    this.updateProjectHeader(store.getState('currentProject'));
  }

  init() {
    if (!this.triggerBtn || !this.drawer) return;

    // 1. Toggle popup open/close on trigger button click
    this.triggerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    });

    // 2. Close button in header
    this.closeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    });

    // 3. Clear chat thread button in header
    this.btnClear?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.clearChat();
    });

    // 4. Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // 5. Close if clicking outside the drawer and trigger button
    document.addEventListener('click', (e) => {
      if (!this.isOpen) return;
      if (!this.drawer.contains(e.target) && !this.triggerBtn.contains(e.target)) {
        // Only close if not interacting with mention popover
        if (!e.target.closest('.mention-popover-menu')) {
          this.close();
        }
      }
    });

    // 6. Mention popover for @-trigger paper search in popup input
    if (this.input) {
      this.mentionPopover = new MentionPopover(this.input);
    }

    // 7. Handle message submission
    this.form?.addEventListener('submit', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.input) {
        this.sendMessage(this.input.value);
      }
    });

    // 8. Quick chip prompt buttons
    this.quickChips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const prompt = chip.dataset.prompt;
        if (prompt) {
          this.sendMessage(prompt);
        }
      });
    });

    // 9. Subscribe to currentProject to update project context & close drawer when exiting
    store.subscribe('currentProject', (project) => {
      this.updateProjectHeader(project);
      if (!project) {
        this.close();
      }
    });

    // 10. Subscribe to chatMessages state store to keep in sync with Chat tab
    store.subscribe('chatMessages', (messages) => {
      if (!this.isWaitingResponse) {
        this.render(messages || []);
      }
    });
  }

  hide() {
    this.wrapper?.classList.add('hidden');
  }

  show() {
    this.wrapper?.classList.remove('hidden');
  }

  updateProjectHeader(project) {
    if (this.subtitleEl) {
      this.subtitleEl.textContent = project ? `Project: ${project.name}` : 'Context-grounded survey paper assistant';
    }
  }

  async clearChat() {
    const project = store.getState('currentProject');
    if (!project) return;
    if (!confirm(`Clear chat conversation for "${project.name}"?`)) return;

    try {
      await api.clearChat(project.id);
      store.setState('chatMessages', []);
      showToast('Project chat history cleared', 'info');
    } catch (err) {
      console.error(err);
    }
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.isOpen = true;
    this.drawer?.classList.remove('hidden');
    this.triggerBtn?.classList.add('chat-open');
    this.iconOpen?.classList.add('hidden');
    this.iconClose?.classList.remove('hidden');

    // Focus input and scroll to bottom
    setTimeout(() => {
      this.input?.focus();
      this.scrollToBottom();
    }, 100);
  }

  close() {
    this.isOpen = false;
    this.drawer?.classList.add('hidden');
    this.triggerBtn?.classList.remove('chat-open');
    this.iconOpen?.classList.remove('hidden');
    this.iconClose?.classList.add('hidden');
  }

  render(messages = []) {
    if (!this.container) return;

    const project = store.getState('currentProject');
    const projName = project ? escapeHtml(project.name) : 'your project';
    const topicText = project?.topic ? ` on "${escapeHtml(project.topic)}"` : '';

    this.container.innerHTML = `
      <div class="chat-message assistant-message">
        <div class="message-avatar">✦</div>
        <div class="message-content">
          <p>Welcome! I'm your research co-pilot for <strong>${projName}</strong>${topicText}. I have full context of this project's uploaded papers, generated taxonomy outline, and drafts.</p>
          <p style="margin-top:6px; font-size:12px; color:var(--text-muted);">Ask me for literature citations, taxonomy comparisons, or LaTeX math equations anytime.</p>
        </div>
      </div>
    `;

    messages.forEach(m => this.appendMessage(m));
    this.scrollToBottom();
  }

  appendMessage(msg) {
    if (!this.container) return;
    const div = document.createElement('div');
    const isAssistant = msg.role === 'assistant';
    div.className = `chat-message ${isAssistant ? 'assistant-message' : 'user-message'}`;

    div.innerHTML = `
      <div class="message-avatar">
        ${isAssistant ? '✦' : 
          `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
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

    if (!project) {
      showToast('Please open or create a research project first.', 'warning');
      return;
    }
    if (!trimmed || this.isWaitingResponse) return;

    const userMsg = { role: 'user', content: trimmed, citations: [] };
    this.appendMessage(userMsg);
    if (this.input) this.input.value = '';

    this.isWaitingResponse = true;

    // Buffer indicator
    const bufferDiv = document.createElement('div');
    bufferDiv.className = 'chat-message assistant-message chat-buffer-msg';
    bufferDiv.id = 'dockedChatTypingIndicator';
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
        <div class="message-avatar" style="background:var(--critical); color:#ffffff; font-size:12px;">✕</div>
        <div class="message-content" style="border-color:#fca5a5; background:#fff5f5; color:#b91c1c;">
          <p>Failed to get response: ${escapeHtml(err.message || 'Check settings and API key')}</p>
        </div>
      `;
      this.container?.appendChild(errorDiv);
      this.scrollToBottom();
    }
  }

  scrollToBottom() {
    if (this.container) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }
}
