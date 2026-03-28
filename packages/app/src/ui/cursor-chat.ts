/**
 * Cursor Chat Improvements
 * - Emoji quick reactions (floating emoji near cursor)
 * - @mention autocomplete from presence users
 * - Chat history panel (recent messages with timestamps)
 */

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
  x: number;
  y: number;
  /** If this is an emoji reaction (rendered large, no bubble) */
  isReaction?: boolean;
}

export interface ChatUser {
  id: string;
  name: string;
  color: string;
}

const MAX_HISTORY = 100;
const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '👀', '✅', '❌'];

export class CursorChat {
  private history: ChatMessage[] = [];
  private onSend: ((text: string, x: number, y: number, isReaction: boolean) => void) | null = null;
  private getUsers: (() => ChatUser[]) | null = null;
  private historyPanel: HTMLElement | null = null;
  private historyVisible = false;
  private onChangeCallbacks: (() => void)[] = [];

  constructor() {}

  /** Wire up send callback and user list provider */
  init(opts: {
    onSend: (text: string, x: number, y: number, isReaction: boolean) => void;
    getUsers: () => ChatUser[];
  }) {
    this.onSend = opts.onSend;
    this.getUsers = opts.getUsers;
  }

  /** Record a message (local or remote) */
  addMessage(msg: Omit<ChatMessage, 'id'>) {
    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const full: ChatMessage = { ...msg, id };
    this.history.push(full);
    if (this.history.length > MAX_HISTORY) {
      this.history.splice(0, this.history.length - MAX_HISTORY);
    }
    this.notifyChange();
    return full;
  }

  getHistory(): ChatMessage[] {
    return this.history;
  }

  onChange(cb: () => void) {
    this.onChangeCallbacks.push(cb);
  }

  private notifyChange() {
    for (const cb of this.onChangeCallbacks) cb();
  }

  // ─── Enhanced Chat Input ───────────────────────────────────

  /**
   * Create an enhanced chat input container with emoji bar and @mention support.
   * Returns the container element and a cleanup function.
   */
  createEnhancedInput(opts: {
    screenX: number;
    screenY: number;
    worldX: number;
    worldY: number;
    onClose: () => void;
    onTyping: (isTyping: boolean) => void;
  }): { container: HTMLElement; cleanup: () => void } {
    const { screenX, screenY, worldX, worldY, onClose, onTyping } = opts;

    const container = document.createElement('div');
    container.className = 'cursor-chat-enhanced';
    container.style.cssText = `
      position: absolute; left: ${screenX + 16}px; top: ${screenY + 20}px; z-index: 9999;
      display: flex; flex-direction: column; gap: 2px;
      background: #fff; border-radius: 10px; padding: 6px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15); border: 2px solid #4ecdc4;
      min-width: 200px; max-width: 280px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    `;

    // Emoji quick bar
    const emojiBar = document.createElement('div');
    emojiBar.style.cssText = `
      display: flex; gap: 2px; padding: 2px 0 4px;
      border-bottom: 1px solid #f0f0f0; margin-bottom: 2px;
    `;
    for (const emoji of QUICK_EMOJIS) {
      const btn = document.createElement('button');
      btn.textContent = emoji;
      btn.style.cssText = `
        border: none; background: none; font-size: 16px; cursor: pointer;
        padding: 2px 4px; border-radius: 4px; line-height: 1;
        transition: background 0.1s;
      `;
      btn.addEventListener('mouseenter', () => { btn.style.background = '#f0f0f0'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault(); // don't steal focus from input
        e.stopPropagation();
        // Send as reaction
        this.onSend?.(emoji, worldX, worldY, true);
        this.addMessage({
          userId: 'local', userName: 'You', text: emoji,
          timestamp: Date.now(), x: worldX, y: worldY, isReaction: true,
        });
        onClose();
      });
      emojiBar.appendChild(btn);
    }
    container.appendChild(emojiBar);

    // Input row
    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display: flex; align-items: center; gap: 4px;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Say something… (@ to mention)';
    input.style.cssText = `
      border: none; outline: none; font-size: 12px; background: transparent;
      width: 100%; color: #1a1a1a; padding: 4px 0;
    `;
    inputRow.appendChild(input);
    container.appendChild(inputRow);

    // @mention dropdown (hidden by default)
    const mentionDropdown = document.createElement('div');
    mentionDropdown.style.cssText = `
      display: none; max-height: 120px; overflow-y: auto;
      border-top: 1px solid #f0f0f0; margin-top: 2px; padding-top: 2px;
    `;
    container.appendChild(mentionDropdown);

    let mentionActive = false;
    let mentionStart = -1;
    let mentionQuery = '';
    let selectedMentionIdx = 0;
    let filteredUsers: ChatUser[] = [];

    const updateMentionDropdown = () => {
      const users = this.getUsers?.() || [];
      mentionDropdown.innerHTML = '';
      filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(mentionQuery.toLowerCase())
      );
      if (filteredUsers.length === 0 || !mentionActive) {
        mentionDropdown.style.display = 'none';
        return;
      }
      mentionDropdown.style.display = 'block';
      selectedMentionIdx = Math.min(selectedMentionIdx, filteredUsers.length - 1);

      filteredUsers.forEach((u, i) => {
        const item = document.createElement('div');
        item.style.cssText = `
          padding: 4px 6px; cursor: pointer; border-radius: 4px; font-size: 12px;
          display: flex; align-items: center; gap: 6px;
          background: ${i === selectedMentionIdx ? '#f0f4ff' : 'transparent'};
        `;
        const dot = document.createElement('span');
        dot.style.cssText = `
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
          background: ${u.color};
        `;
        item.appendChild(dot);
        item.appendChild(document.createTextNode(u.name));
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          completeMention(u);
        });
        mentionDropdown.appendChild(item);
      });
    };

    const completeMention = (user: ChatUser) => {
      const val = input.value;
      const before = val.slice(0, mentionStart);
      const after = val.slice(mentionStart + mentionQuery.length + 1); // +1 for @
      input.value = `${before}@${user.name} ${after}`;
      mentionActive = false;
      mentionDropdown.style.display = 'none';
      input.focus();
    };

    let typingTimeout: ReturnType<typeof setTimeout> | null = null;

    input.addEventListener('input', () => {
      onTyping(true);
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => onTyping(false), 2000);

      // Check for @mention
      const val = input.value;
      const cursorPos = input.selectionStart || 0;
      // Find the last @ before cursor
      const beforeCursor = val.slice(0, cursorPos);
      const atIdx = beforeCursor.lastIndexOf('@');
      if (atIdx >= 0 && (atIdx === 0 || val[atIdx - 1] === ' ')) {
        mentionActive = true;
        mentionStart = atIdx;
        mentionQuery = beforeCursor.slice(atIdx + 1);
        selectedMentionIdx = 0;
        updateMentionDropdown();
      } else {
        mentionActive = false;
        mentionDropdown.style.display = 'none';
      }
    });

    input.addEventListener('keydown', (e) => {
      e.stopPropagation();

      if (mentionActive && filteredUsers.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedMentionIdx = (selectedMentionIdx + 1) % filteredUsers.length;
          updateMentionDropdown();
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedMentionIdx = (selectedMentionIdx - 1 + filteredUsers.length) % filteredUsers.length;
          updateMentionDropdown();
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && mentionActive)) {
          e.preventDefault();
          completeMention(filteredUsers[selectedMentionIdx]);
          return;
        }
      }

      if (e.key === 'Enter' && input.value.trim()) {
        const text = input.value.trim();
        this.onSend?.(text, worldX, worldY, false);
        this.addMessage({
          userId: 'local', userName: 'You', text,
          timestamp: Date.now(), x: worldX, y: worldY,
        });
        onTyping(false);
        onClose();
      } else if (e.key === 'Escape') {
        onTyping(false);
        onClose();
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (container.isConnected) {
          onTyping(false);
          onClose();
        }
      }, 150);
    });

    // Focus input on next frame
    requestAnimationFrame(() => input.focus());

    const cleanup = () => {
      if (typingTimeout) clearTimeout(typingTimeout);
      container.remove();
    };

    return { container, cleanup };
  }

  // ─── Chat History Panel ────────────────────────────────────

  toggleHistoryPanel(parentEl: HTMLElement) {
    if (this.historyVisible) {
      this.hideHistoryPanel();
    } else {
      this.showHistoryPanel(parentEl);
    }
  }

  showHistoryPanel(parentEl: HTMLElement) {
    this.hideHistoryPanel();
    this.historyVisible = true;

    const panel = document.createElement('div');
    panel.className = 'cursor-chat-history';
    panel.style.cssText = `
      position: absolute; right: 12px; bottom: 48px; z-index: 9998;
      width: 280px; max-height: 360px;
      background: #fff; border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      display: flex; flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      overflow: hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 10px 14px; font-size: 13px; font-weight: 600; color: #1a1a1a;
      border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; justify-content: space-between;
    `;
    header.textContent = 'Chat History';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      border: none; background: none; cursor: pointer; font-size: 14px;
      color: #999; padding: 0 2px; line-height: 1;
    `;
    closeBtn.addEventListener('click', () => this.hideHistoryPanel());
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Message list
    const list = document.createElement('div');
    list.style.cssText = `
      flex: 1; overflow-y: auto; padding: 8px 10px;
      display: flex; flex-direction: column; gap: 6px;
    `;
    panel.appendChild(list);

    const renderMessages = () => {
      list.innerHTML = '';
      const msgs = this.history.filter(m => !m.isReaction);
      if (msgs.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'No messages yet. Press / to chat.';
        empty.style.cssText = 'color: #999; font-size: 12px; text-align: center; padding: 20px 0;';
        list.appendChild(empty);
        return;
      }
      for (const msg of msgs.slice(-50)) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; gap: 6px; align-items: flex-start;';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = msg.userName;
        nameSpan.style.cssText = `
          font-size: 11px; font-weight: 600; color: #555;
          flex-shrink: 0; min-width: 48px;
        `;

        const textSpan = document.createElement('span');
        // Highlight @mentions
        textSpan.innerHTML = this.highlightMentions(this.escapeHtml(msg.text));
        textSpan.style.cssText = 'font-size: 12px; color: #1a1a1a; word-break: break-word; flex: 1;';

        const timeSpan = document.createElement('span');
        timeSpan.textContent = this.formatTime(msg.timestamp);
        timeSpan.style.cssText = 'font-size: 10px; color: #bbb; flex-shrink: 0; margin-top: 1px;';

        row.appendChild(nameSpan);
        row.appendChild(textSpan);
        row.appendChild(timeSpan);
        list.appendChild(row);
      }
      // Scroll to bottom
      list.scrollTop = list.scrollHeight;
    };

    renderMessages();
    this.onChange(renderMessages);

    parentEl.appendChild(panel);
    this.historyPanel = panel;
  }

  hideHistoryPanel() {
    this.historyPanel?.remove();
    this.historyPanel = null;
    this.historyVisible = false;
  }

  get isHistoryVisible() {
    return this.historyVisible;
  }

  // ─── Reaction Rendering ────────────────────────────────────

  /** Get active emoji reactions to render on canvas (floating, fading) */
  getActiveReactions(): { emoji: string; x: number; y: number; age: number; alpha: number }[] {
    const now = Date.now();
    const REACTION_DURATION = 2000;
    const REACTION_FADE = 500;
    const results: { emoji: string; x: number; y: number; age: number; alpha: number }[] = [];

    for (const msg of this.history) {
      if (!msg.isReaction) continue;
      const age = now - msg.timestamp;
      if (age > REACTION_DURATION + REACTION_FADE) continue;
      let alpha = 1;
      if (age > REACTION_DURATION) {
        alpha = 1 - (age - REACTION_DURATION) / REACTION_FADE;
      }
      results.push({
        emoji: msg.text,
        x: msg.x,
        y: msg.y,
        age,
        alpha,
      });
    }
    return results;
  }

  /** Render floating emoji reactions on canvas */
  renderReactions(ctx: CanvasRenderingContext2D, zoom: number, panX: number, panY: number) {
    const reactions = this.getActiveReactions();
    for (const r of reactions) {
      const sx = r.x * zoom + panX;
      // Float upward as they age
      const floatOffset = (r.age / 2000) * 30;
      const sy = r.y * zoom + panY - floatOffset;

      ctx.save();
      ctx.globalAlpha = r.alpha;
      ctx.font = '28px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.emoji, sx, sy);
      ctx.restore();
    }
  }

  // ─── Helpers ───────────────────────────────────────────────

  private formatTime(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private highlightMentions(html: string): string {
    return html.replace(/@(\w+)/g, '<span style="color:#4ecdc4;font-weight:600">@$1</span>');
  }
}
