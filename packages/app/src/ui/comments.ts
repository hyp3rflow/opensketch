import type { Editor } from "../editor";

interface CommentData {
  id: number;
  x: number;
  y: number;
  author: string;
  text: string;
  timestamp: number;
  resolved: boolean;
  replies: { id: number; author: string; text: string; timestamp: number }[];
  node_id: number | null;
  page_id: number;
}

const COMMENT_AUTHOR = "User"; // Default author name

/**
 * Comment pins rendered on the canvas overlay
 */
export class CommentOverlay {
  private container: HTMLDivElement;
  private editor: Editor;
  private commentMode = false;
  private openCommentId: number | null = null;
  private popup: HTMLDivElement | null = null;
  private showResolved = false;

  constructor(canvasParent: HTMLElement, editor: Editor) {
    this.editor = editor;
    this.container = document.createElement("div");
    this.container.id = "comment-overlay";
    this.container.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:50;";
    canvasParent.style.position = "relative";
    canvasParent.appendChild(this.container);

    // Click on canvas to place comment when in comment mode
    editor.canvas.addEventListener("click", (e) => {
      if (!this.commentMode) return;
      const sx = editor.engine.screen_to_scene_x(e.offsetX, e.offsetY);
      const sy = editor.engine.screen_to_scene_y(e.offsetX, e.offsetY);
      this.promptNewComment(sx, sy, e.offsetX, e.offsetY);
    });

    // Re-render pins on zoom/pan
    editor.onZoomChanged(() => this.renderPins());

    // Keyboard: C to toggle comment mode
    window.addEventListener("keydown", (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "c" || e.key === "C") {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          this.toggleCommentMode();
        }
      }
    });
  }

  toggleCommentMode() {
    this.commentMode = !this.commentMode;
    this.editor.canvas.style.cursor = this.commentMode ? "crosshair" : "";
    this.container.style.pointerEvents = this.commentMode ? "auto" : "none";
    this.renderPins();
    // Dispatch event for toolbar
    window.dispatchEvent(new CustomEvent("comment-mode-changed", { detail: this.commentMode }));
  }

  isCommentMode() {
    return this.commentMode;
  }

  setShowResolved(show: boolean) {
    this.showResolved = show;
    this.renderPins();
  }

  private getComments(): CommentData[] {
    try {
      return JSON.parse(this.editor.engine.get_comments());
    } catch {
      return [];
    }
  }

  renderPins() {
    // Remove old pins but keep popup
    this.container.querySelectorAll(".comment-pin").forEach((el) => el.remove());
    const comments = this.getComments();
    const zoom = this.editor.engine.get_zoom();
    const panX = this.editor.engine.get_pan_x();
    const panY = this.editor.engine.get_pan_y();

    for (const c of comments) {
      if (c.resolved && !this.showResolved) continue;
      const screenX = c.x * zoom + panX;
      const screenY = c.y * zoom + panY;

      const pin = document.createElement("div");
      pin.className = "comment-pin";
      pin.dataset.commentId = String(c.id);
      pin.style.cssText = `
        position:absolute; left:${screenX - 12}px; top:${screenY - 28}px;
        width:24px; height:28px; pointer-events:auto; cursor:pointer; z-index:51;
      `;
      pin.innerHTML = `<svg width="24" height="28" viewBox="0 0 24 28" fill="none">
        <path d="M12 0C5.4 0 0 4.8 0 10.8c0 3.6 1.8 6.6 4.8 8.4L12 28l7.2-8.8C22.2 17.4 24 14.4 24 10.8 24 4.8 18.6 0 12 0z" fill="${c.resolved ? '#888' : '#4a90d9'}"/>
        <circle cx="12" cy="10" r="5" fill="white"/>
        <text x="12" y="13" text-anchor="middle" font-size="9" font-weight="700" fill="${c.resolved ? '#888' : '#4a90d9'}">${c.replies.length > 0 ? c.replies.length + 1 : ""}</text>
      </svg>`;
      pin.title = `${c.author}: ${c.text}`;

      pin.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openThread(c.id);
      });

      this.container.appendChild(pin);
    }
  }

  private promptNewComment(sceneX: number, sceneY: number, screenX: number, screenY: number) {
    this.closePopup();
    const popup = this.createPopup(screenX, screenY);
    popup.innerHTML = `
      <div style="padding:12px; width:260px;">
        <textarea class="comment-input" placeholder="Add a comment..." rows="3" style="width:100%;border:1px solid #444;background:#2a2a2a;color:#eee;border-radius:6px;padding:8px;resize:none;font-size:13px;font-family:inherit;box-sizing:border-box;"></textarea>
        <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px;">
          <button class="comment-cancel" style="padding:4px 12px;border:1px solid #555;background:transparent;color:#aaa;border-radius:4px;cursor:pointer;font-size:12px;">Cancel</button>
          <button class="comment-submit" style="padding:4px 12px;border:none;background:#4a90d9;color:white;border-radius:4px;cursor:pointer;font-size:12px;">Post</button>
        </div>
      </div>
    `;
    const textarea = popup.querySelector<HTMLTextAreaElement>(".comment-input")!;
    textarea.focus();

    popup.querySelector(".comment-cancel")!.addEventListener("click", () => this.closePopup());
    popup.querySelector(".comment-submit")!.addEventListener("click", () => {
      const text = textarea.value.trim();
      if (!text) return;
      this.editor.engine.add_comment(sceneX, sceneY, COMMENT_AUTHOR, text);
      this.closePopup();
      this.commentMode = false;
      this.editor.canvas.style.cursor = "";
      this.container.style.pointerEvents = "none";
      window.dispatchEvent(new CustomEvent("comment-mode-changed", { detail: false }));
      this.renderPins();
      window.dispatchEvent(new CustomEvent("comments-changed"));
    });

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        popup.querySelector<HTMLButtonElement>(".comment-submit")!.click();
      }
      if (e.key === "Escape") this.closePopup();
    });
  }

  private openThread(commentId: number) {
    this.closePopup();
    this.openCommentId = commentId;
    let comment: CommentData;
    try {
      comment = JSON.parse(this.editor.engine.get_comment(commentId));
    } catch {
      return;
    }
    if (!comment) return;

    const zoom = this.editor.engine.get_zoom();
    const panX = this.editor.engine.get_pan_x();
    const panY = this.editor.engine.get_pan_y();
    const screenX = comment.x * zoom + panX;
    const screenY = comment.y * zoom + panY;

    const popup = this.createPopup(screenX + 16, screenY);
    this.renderThread(popup, comment);
  }

  private renderThread(popup: HTMLDivElement, comment: CommentData) {
    const formatTime = (ts: number) => {
      const d = new Date(ts);
      return d.toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    };

    const repliesHtml = comment.replies.map((r) => `
      <div style="padding:8px 0;border-top:1px solid #333;">
        <div style="font-weight:600;font-size:12px;color:#ccc;">${r.author} <span style="font-weight:400;color:#777;margin-left:6px;">${formatTime(r.timestamp)}</span></div>
        <div style="font-size:13px;color:#ddd;margin-top:4px;">${r.text}</div>
      </div>
    `).join("");

    popup.innerHTML = `
      <div style="padding:12px;width:280px;max-height:400px;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-weight:600;font-size:12px;color:#ccc;">${comment.author} <span style="font-weight:400;color:#777;margin-left:6px;">${formatTime(comment.timestamp)}</span></span>
          <div style="display:flex;gap:4px;">
            <button class="comment-resolve" title="${comment.resolved ? 'Unresolve' : 'Resolve'}" style="background:none;border:none;cursor:pointer;color:${comment.resolved ? '#4a90d9' : '#777'};font-size:14px;">✓</button>
            <button class="comment-delete" title="Delete" style="background:none;border:none;cursor:pointer;color:#777;font-size:14px;">✕</button>
          </div>
        </div>
        <div style="font-size:13px;color:#ddd;margin-bottom:8px;">${comment.text}</div>
        ${repliesHtml}
        <div style="margin-top:8px;border-top:1px solid #333;padding-top:8px;">
          <textarea class="reply-input" placeholder="Reply..." rows="2" style="width:100%;border:1px solid #444;background:#2a2a2a;color:#eee;border-radius:6px;padding:6px;resize:none;font-size:12px;font-family:inherit;box-sizing:border-box;"></textarea>
          <button class="reply-submit" style="margin-top:4px;padding:3px 10px;border:none;background:#4a90d9;color:white;border-radius:4px;cursor:pointer;font-size:11px;">Reply</button>
        </div>
      </div>
    `;

    popup.querySelector(".comment-resolve")!.addEventListener("click", () => {
      this.editor.engine.resolve_comment(comment.id, !comment.resolved);
      this.renderPins();
      window.dispatchEvent(new CustomEvent("comments-changed"));
      // Re-open with updated data
      this.openThread(comment.id);
    });

    popup.querySelector(".comment-delete")!.addEventListener("click", () => {
      this.editor.engine.remove_comment(comment.id);
      this.closePopup();
      this.renderPins();
      window.dispatchEvent(new CustomEvent("comments-changed"));
    });

    const replyInput = popup.querySelector<HTMLTextAreaElement>(".reply-input")!;
    popup.querySelector(".reply-submit")!.addEventListener("click", () => {
      const text = replyInput.value.trim();
      if (!text) return;
      this.editor.engine.add_reply(comment.id, COMMENT_AUTHOR, text);
      this.renderPins();
      window.dispatchEvent(new CustomEvent("comments-changed"));
      this.openThread(comment.id);
    });

    replyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        popup.querySelector<HTMLButtonElement>(".reply-submit")!.click();
      }
    });
  }

  private createPopup(x: number, y: number): HTMLDivElement {
    const popup = document.createElement("div");
    popup.className = "comment-popup";
    popup.style.cssText = `
      position:absolute; left:${x}px; top:${y}px; z-index:100;
      background:#1e1e1e; border:1px solid #444; border-radius:8px;
      box-shadow:0 8px 24px rgba(0,0,0,0.5); pointer-events:auto;
    `;
    this.container.appendChild(popup);
    this.popup = popup;

    // Close on outside click
    const handler = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node) && !(e.target as HTMLElement).closest(".comment-pin")) {
        this.closePopup();
        document.removeEventListener("mousedown", handler);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", handler), 10);

    return popup;
  }

  private closePopup() {
    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }
    this.openCommentId = null;
  }
}

/**
 * Comments panel in right pane — list of all comments
 */
export function setupCommentsPanel(container: HTMLElement, editor: Editor, overlay: CommentOverlay) {
  const render = () => {
    let comments: CommentData[] = [];
    try {
      comments = JSON.parse(editor.engine.get_all_comments());
    } catch { /* */ }

    const unresolved = comments.filter((c) => !c.resolved);
    const resolved = comments.filter((c) => c.resolved);

    const formatTime = (ts: number) => {
      const d = new Date(ts);
      return d.toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    };

    container.innerHTML = `
      <div style="padding:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <span style="font-size:12px;color:#999;">${comments.length} comment${comments.length !== 1 ? "s" : ""}</span>
          <div style="display:flex;gap:4px;">
            <button id="export-comments-btn" style="padding:4px 10px;border:1px solid #555;background:transparent;color:#aaa;border-radius:4px;cursor:pointer;font-size:11px;" title="Export annotations as Markdown">↓ MD</button>
            <button id="export-annotations-json-btn" style="padding:4px 10px;border:1px solid #555;background:transparent;color:#aaa;border-radius:4px;cursor:pointer;font-size:11px;" title="Export annotations as JSON">↓ JSON</button>
            <button id="add-comment-btn" style="padding:4px 10px;border:none;background:#4a90d9;color:white;border-radius:4px;cursor:pointer;font-size:11px;">+ Add</button>
          </div>
        </div>
        ${unresolved.length === 0 && resolved.length === 0 ? '<div style="color:#666;font-size:12px;text-align:center;padding:20px 0;">No comments yet.<br>Click + Add or press C to add one.</div>' : ""}
        ${unresolved.map((c) => commentCard(c, formatTime)).join("")}
        ${resolved.length > 0 ? `
          <div style="margin-top:12px;padding-top:8px;border-top:1px solid #333;">
            <div style="font-size:11px;color:#777;margin-bottom:8px;">Resolved (${resolved.length})</div>
            ${resolved.map((c) => commentCard(c, formatTime)).join("")}
          </div>
        ` : ""}
      </div>
    `;

    container.querySelector("#add-comment-btn")?.addEventListener("click", () => {
      overlay.toggleCommentMode();
    });

    container.querySelector("#export-comments-btn")?.addEventListener("click", () => {
      const md = editor.engine.export_annotations_markdown();
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "annotations-report.md";
      a.click();
      URL.revokeObjectURL(url);
    });

    container.querySelector("#export-annotations-json-btn")?.addEventListener("click", () => {
      const json = editor.engine.export_annotations_json();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "annotations-report.json";
      a.click();
      URL.revokeObjectURL(url);
    });

    container.querySelectorAll(".comment-card").forEach((card) => {
      card.addEventListener("click", () => {
        const id = Number((card as HTMLElement).dataset.commentId);
        const c = comments.find((x) => x.id === id);
        if (!c) return;
        // Pan to comment using set_viewport
        const zoom = editor.engine.get_zoom();
        const cw = editor.canvas.width / devicePixelRatio;
        const ch = editor.canvas.height / devicePixelRatio;
        const targetPanX = -c.x * zoom + cw / 2;
        const targetPanY = -c.y * zoom + ch / 2;
        editor.engine.set_viewport(zoom, targetPanX, targetPanY);
        editor.requestRender();
        overlay.renderPins();
      });
    });

    container.querySelectorAll(".comment-resolve-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = Number((btn as HTMLElement).dataset.commentId);
        const c = comments.find((x) => x.id === id);
        if (c) {
          editor.engine.resolve_comment(id, !c.resolved);
          overlay.renderPins();
          render();
        }
      });
    });
  };

  function commentCard(c: CommentData, formatTime: (ts: number) => string): string {
    return `
      <div class="comment-card" data-comment-id="${c.id}" style="padding:8px;margin-bottom:6px;background:#2a2a2a;border-radius:6px;cursor:pointer;border:1px solid #383838;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:11px;font-weight:600;color:#ccc;">${c.author}</span>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="font-size:10px;color:#666;">${formatTime(c.timestamp)}</span>
            <button class="comment-resolve-btn" data-comment-id="${c.id}" title="${c.resolved ? 'Unresolve' : 'Resolve'}" style="background:none;border:none;cursor:pointer;color:${c.resolved ? '#4a90d9' : '#555'};font-size:12px;padding:2px;">✓</button>
          </div>
        </div>
        <div style="font-size:12px;color:#ddd;margin-top:4px;${c.resolved ? 'text-decoration:line-through;opacity:0.6;' : ''}">${c.text}</div>
        ${c.replies.length > 0 ? `<div style="font-size:10px;color:#777;margin-top:4px;">${c.replies.length} repl${c.replies.length === 1 ? "y" : "ies"}</div>` : ""}
      </div>
    `;
  }

  render();

  // Re-render when comments change
  window.addEventListener("comments-changed", render);

  // Also re-render on selection changes for context
  editor.onSelection(() => render());
}
