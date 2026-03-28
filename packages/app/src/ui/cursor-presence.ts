/**
 * Cursor Presence Indicators
 * Simulates multi-user cursors on canvas for collaboration readiness.
 * Each remote cursor shows: colored arrow + name label + optional selection highlight.
 */

export interface ChatBubble {
  text: string;
  /** Timestamp when the message was sent */
  sentAt: number;
  /** Canvas (world) coordinates of the message */
  x: number;
  y: number;
}

export interface RemoteViewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface RemoteCursor {
  id: string;
  name: string;
  color: string;
  /** Canvas (world) coordinates */
  x: number;
  y: number;
  /** Selected node IDs */
  selectedIds?: number[];
  /** Last update timestamp */
  lastSeen: number;
  /** Active tool name */
  tool?: string;
  /** Current chat bubble */
  chatBubble?: ChatBubble;
  /** Whether this user is currently typing */
  isTyping?: boolean;
  /** Remote user's viewport (for follow mode) */
  viewport?: RemoteViewport;
}

const CURSOR_COLORS = [
  '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7',
  '#fd79a8', '#00b894', '#e17055', '#0984e3', '#a29bfe',
];

const CURSOR_TIMEOUT_MS = 10_000; // fade out after 10s inactivity
const FADE_DURATION_MS = 2_000;
const CHAT_DISPLAY_MS = 4_000; // chat bubble visible for 4s
const CHAT_FADE_MS = 500; // fade out duration

export class CursorPresence {
  private cursors: Map<string, RemoteCursor> = new Map();
  private colorIndex = 0;
  private localUserId: string;
  private localUserName: string;
  /** ID of the user we are following (null = not following anyone) */
  private _followingId: string | null = null;
  /** Callback invoked when follow mode wants to sync viewport */
  onFollowViewportSync: ((viewport: RemoteViewport) => void) | null = null;

  constructor(localUserId?: string, localUserName?: string) {
    this.localUserId = localUserId || `user-${Math.random().toString(36).slice(2, 8)}`;
    this.localUserName = localUserName || 'You';
  }

  // --- Follow mode ---

  /** Start following a remote user's viewport */
  follow(userId: string) {
    if (userId === this.localUserId) return;
    if (!this.cursors.has(userId)) return;
    this._followingId = userId;
  }

  /** Stop following */
  unfollow() {
    this._followingId = null;
  }

  /** Toggle follow for a user (Cmd+click) */
  toggleFollow(userId: string) {
    if (this._followingId === userId) {
      this.unfollow();
    } else {
      this.follow(userId);
    }
  }

  /** Get the user ID we're currently following */
  get followingId(): string | null { return this._followingId; }

  /** Update a remote cursor's viewport info */
  updateCursorViewport(id: string, viewport: RemoteViewport) {
    const cursor = this.cursors.get(id);
    if (cursor) {
      cursor.viewport = viewport;
      // If we're following this user, sync viewport
      if (this._followingId === id && this.onFollowViewportSync) {
        this.onFollowViewportSync(viewport);
      }
    }
  }

  /** Tick follow mode: center viewport on followed cursor's position */
  tickFollow(): RemoteViewport | null {
    if (!this._followingId) return null;
    const cursor = this.cursors.get(this._followingId);
    if (!cursor) {
      this._followingId = null;
      return null;
    }
    // If cursor has viewport, use that; otherwise center on cursor position
    if (cursor.viewport) return cursor.viewport;
    return null;
  }

  /** Add or update a remote cursor */
  updateCursor(id: string, name: string, x: number, y: number, opts?: { selectedIds?: number[]; tool?: string }) {
    let cursor = this.cursors.get(id);
    if (!cursor) {
      cursor = {
        id, name,
        color: CURSOR_COLORS[this.colorIndex++ % CURSOR_COLORS.length],
        x, y,
        lastSeen: Date.now(),
      };
      this.cursors.set(id, cursor);
    }
    cursor.x = x;
    cursor.y = y;
    cursor.lastSeen = Date.now();
    if (opts?.selectedIds) cursor.selectedIds = opts.selectedIds;
    if (opts?.tool) cursor.tool = opts.tool;
  }

  removeCursor(id: string) {
    this.cursors.delete(id);
    if (this._followingId === id) this._followingId = null;
  }

  /** Set a chat bubble on a cursor (or local pseudo-cursor) */
  setChatBubble(id: string, name: string, text: string, x: number, y: number) {
    let cursor = this.cursors.get(id);
    if (!cursor) {
      cursor = {
        id, name,
        color: CURSOR_COLORS[this.colorIndex++ % CURSOR_COLORS.length],
        x, y, lastSeen: Date.now(),
      };
      this.cursors.set(id, cursor);
    }
    cursor.chatBubble = { text, sentAt: Date.now(), x, y };
    cursor.lastSeen = Date.now();
  }

  /** Set typing indicator for a cursor */
  setTyping(id: string, isTyping: boolean) {
    const cursor = this.cursors.get(id);
    if (cursor) cursor.isTyping = isTyping;
  }

  /** Set a local chat bubble (shown on own cursor position) */
  setLocalChat(text: string, x: number, y: number) {
    this.setChatBubble(this.localUserId, this.localUserName, text, x, y);
  }

  /** Set local typing indicator */
  setLocalTyping(isTyping: boolean, x: number, y: number) {
    if (isTyping) {
      let cursor = this.cursors.get(this.localUserId);
      if (!cursor) {
        cursor = {
          id: this.localUserId, name: this.localUserName,
          color: CURSOR_COLORS[this.colorIndex++ % CURSOR_COLORS.length],
          x, y, lastSeen: Date.now(),
        };
        this.cursors.set(this.localUserId, cursor);
      }
      cursor.x = x;
      cursor.y = y;
      cursor.isTyping = true;
      cursor.lastSeen = Date.now();
    } else {
      const cursor = this.cursors.get(this.localUserId);
      if (cursor) cursor.isTyping = false;
    }
  }

  getCursors(): RemoteCursor[] {
    return Array.from(this.cursors.values());
  }

  /** Remove stale cursors */
  cleanup() {
    const now = Date.now();
    for (const [id, c] of this.cursors) {
      if (now - c.lastSeen > CURSOR_TIMEOUT_MS + FADE_DURATION_MS) {
        this.cursors.delete(id);
        if (this._followingId === id) this._followingId = null;
      }
    }
  }

  /** Render all remote cursors on the canvas */
  render(ctx: CanvasRenderingContext2D, zoom: number, panX: number, panY: number) {
    this.cleanup();
    const now = Date.now();

    for (const cursor of this.cursors.values()) {
      const age = now - cursor.lastSeen;
      let alpha = 1;
      if (age > CURSOR_TIMEOUT_MS) {
        alpha = 1 - Math.min(1, (age - CURSOR_TIMEOUT_MS) / FADE_DURATION_MS);
      }
      if (alpha <= 0) continue;

      // Convert world coords to screen coords
      const sx = cursor.x * zoom + panX;
      const sy = cursor.y * zoom + panY;

      ctx.save();
      ctx.globalAlpha = alpha;

      // Draw cursor arrow
      this.drawCursorArrow(ctx, sx, sy, cursor.color);

      // Draw name label (with follow badge if applicable)
      const isFollowed = this._followingId === cursor.id;
      this.drawNameLabel(ctx, sx, sy, cursor.name, cursor.color, isFollowed);

      // Draw typing indicator
      if (cursor.isTyping && !cursor.chatBubble) {
        this.drawChatBubble(ctx, sx, sy, '···', cursor.color, 1);
      }

      // Draw chat bubble
      if (cursor.chatBubble) {
        const chatAge = now - cursor.chatBubble.sentAt;
        if (chatAge < CHAT_DISPLAY_MS + CHAT_FADE_MS) {
          let chatAlpha = 1;
          if (chatAge > CHAT_DISPLAY_MS) {
            chatAlpha = 1 - (chatAge - CHAT_DISPLAY_MS) / CHAT_FADE_MS;
          }
          this.drawChatBubble(ctx, sx, sy, cursor.chatBubble.text, cursor.color, chatAlpha * alpha);
        } else {
          cursor.chatBubble = undefined;
        }
      }

      ctx.restore();
    }
  }

  /** Render selection highlights for remote cursors */
  renderSelectionHighlights(
    ctx: CanvasRenderingContext2D,
    zoom: number, panX: number, panY: number,
    getNodeBounds: (id: number) => { x: number; y: number; w: number; h: number } | null
  ) {
    const now = Date.now();
    for (const cursor of this.cursors.values()) {
      if (!cursor.selectedIds || cursor.selectedIds.length === 0) continue;
      const age = now - cursor.lastSeen;
      let alpha = 0.3;
      if (age > CURSOR_TIMEOUT_MS) {
        alpha *= 1 - Math.min(1, (age - CURSOR_TIMEOUT_MS) / FADE_DURATION_MS);
      }
      if (alpha <= 0) continue;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = cursor.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);

      for (const nid of cursor.selectedIds) {
        const b = getNodeBounds(nid);
        if (!b) continue;
        const rx = b.x * zoom + panX;
        const ry = b.y * zoom + panY;
        const rw = b.w * zoom;
        const rh = b.h * zoom;
        ctx.strokeRect(rx, ry, rw, rh);
      }

      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  private drawCursorArrow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
    ctx.save();
    ctx.translate(x, y);

    // Arrow shape (Figma-style pointer)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(4.5, 12.5);
    ctx.lineTo(8, 20);
    ctx.lineTo(11, 19);
    ctx.lineTo(7.5, 11);
    ctx.lineTo(12, 10);
    ctx.closePath();

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  private drawNameLabel(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, color: string, isFollowed = false) {
    const labelX = x + 14;
    const labelY = y + 18;
    const fontSize = 11;
    const paddingH = 6;
    const paddingV = 3;

    const displayName = isFollowed ? `👁 ${name}` : name;

    ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    const metrics = ctx.measureText(displayName);
    const tw = metrics.width;
    const th = fontSize;

    const bgW = tw + paddingH * 2;
    const bgH = th + paddingV * 2;
    const radius = 4;

    // Rounded rect background
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, bgW, bgH, radius);
    ctx.fillStyle = color;
    ctx.fill();

    // Glowing border when following
    if (isFollowed) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Text
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(displayName, labelX + paddingH, labelY + paddingV);
  }

  private drawChatBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, alpha: number) {
    if (alpha <= 0) return;
    const bubbleX = x + 14;
    const bubbleY = y + 34; // below name label
    const fontSize = 12;
    const paddingH = 8;
    const paddingV = 5;
    const maxWidth = 200;
    const radius = 6;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `400 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

    // Word wrap
    const lines = this.wrapText(ctx, text, maxWidth - paddingH * 2);
    const lineHeight = fontSize + 3;
    const tw = Math.min(maxWidth - paddingH * 2, Math.max(...lines.map(l => ctx.measureText(l).width)));
    const bgW = tw + paddingH * 2;
    const bgH = lines.length * lineHeight + paddingV * 2;

    // Bubble background
    ctx.beginPath();
    ctx.roundRect(bubbleX, bubbleY, bgW, bgH, radius);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fill();

    // Color accent line on top
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.roundRect(bubbleX, bubbleY, bgW, 3, [radius, radius, 0, 0]);
    ctx.fillStyle = color;
    ctx.fill();

    // Text
    ctx.fillStyle = '#1a1a1a';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], bubbleX + paddingH, bubbleY + paddingV + 3 + i * lineHeight);
    }

    ctx.restore();
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  // --- Demo simulation helpers ---

  /** Start a demo simulation with fake remote cursors */
  startDemo(canvasWidth: number, canvasHeight: number): () => void {
    const demoUsers = [
      { id: 'demo-alice', name: 'Alice' },
      { id: 'demo-bob', name: 'Bob' },
      { id: 'demo-carol', name: 'Carol' },
    ];

    // Initialize positions
    for (const u of demoUsers) {
      this.updateCursor(u.id, u.name,
        200 + Math.random() * (canvasWidth - 400),
        200 + Math.random() * (canvasHeight - 400));
    }

    // Smooth random movement
    const targets: Map<string, { tx: number; ty: number }> = new Map();
    for (const u of demoUsers) {
      const c = this.cursors.get(u.id)!;
      targets.set(u.id, { tx: c.x, ty: c.y });
    }

    const interval = setInterval(() => {
      for (const u of demoUsers) {
        const cursor = this.cursors.get(u.id);
        if (!cursor) continue;
        const t = targets.get(u.id)!;

        // Pick new target occasionally
        if (Math.random() < 0.03) {
          t.tx = 100 + Math.random() * (canvasWidth - 200);
          t.ty = 100 + Math.random() * (canvasHeight - 200);
        }

        // Ease toward target
        const dx = t.tx - cursor.x;
        const dy = t.ty - cursor.y;
        const ease = 0.04;
        this.updateCursor(u.id, u.name, cursor.x + dx * ease, cursor.y + dy * ease);
      }
    }, 50);

    return () => {
      clearInterval(interval);
      for (const u of demoUsers) this.removeCursor(u.id);
    };
  }
}
