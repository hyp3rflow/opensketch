/**
 * Review Panel — Branch review workflow UI
 * Request review, approve/reject, comment on diffs, merge.
 */
import type { Editor } from "../editor";

interface ReviewRequest {
  id: number;
  branch_id: number;
  title: string;
  description: string;
  status: "Open" | "Approved" | "Rejected" | "Merged";
  reviewer: string;
  created_at: number;
  updated_at: number;
}

interface ReviewComment {
  id: number;
  review_id: number;
  node_id: number | null;
  text: string;
  author: string;
  timestamp: number;
  resolved: boolean;
}

interface DiffNode {
  id: number;
  name: string;
}

interface BranchDiff {
  added: DiffNode[];
  modified: DiffNode[];
  removed: DiffNode[];
}

let currentReviewId: number | null = null;
let panelEl: HTMLElement | null = null;
let activeTab: "open" | "closed" = "open";

export function setupReviewPanel(container: HTMLElement, editor: Editor) {
  panelEl = document.createElement("div");
  panelEl.className = "review-panel";
  panelEl.style.cssText = `
    display:none; position:fixed; top:60px; right:12px; width:360px; max-height:calc(100vh - 80px);
    background:#1e1e2e; border:1px solid #333; border-radius:12px; z-index:9000;
    font-family:Inter,system-ui,sans-serif; color:#cdd6f4; overflow:hidden;
    box-shadow:0 8px 32px rgba(0,0,0,0.4); display:flex; flex-direction:column;
  `;
  panelEl.style.display = "none";
  container.appendChild(panelEl);

  const render = () => renderPanel(panelEl!, editor);
  (editor as any)._reviewPanelRender = render;
  return { show: () => { panelEl!.style.display = "flex"; render(); }, hide: () => { panelEl!.style.display = "none"; } };
}

function renderPanel(el: HTMLElement, editor: Editor) {
  if (currentReviewId !== null) {
    renderReviewDetail(el, editor);
    return;
  }
  renderReviewList(el, editor);
}

function renderReviewList(el: HTMLElement, editor: Editor) {
  const reviews: ReviewRequest[] = JSON.parse((editor as any).engine.get_reviews());
  const open = reviews.filter(r => r.status === "Open");
  const closed = reviews.filter(r => r.status !== "Open");
  const list = activeTab === "open" ? open : closed;

  el.innerHTML = `
    <div style="padding:12px 16px; border-bottom:1px solid #333; display:flex; align-items:center; justify-content:space-between;">
      <span style="font-weight:600; font-size:14px;">Reviews</span>
      <button id="rv-close" style="background:none; border:none; color:#888; cursor:pointer; font-size:18px;">✕</button>
    </div>
    <div style="display:flex; border-bottom:1px solid #333;">
      <button class="rv-tab" data-tab="open" style="flex:1; padding:8px; background:${activeTab === "open" ? "#313244" : "transparent"}; border:none; color:#cdd6f4; cursor:pointer; font-size:12px;">
        Open (${open.length})
      </button>
      <button class="rv-tab" data-tab="closed" style="flex:1; padding:8px; background:${activeTab === "closed" ? "#313244" : "transparent"}; border:none; color:#cdd6f4; cursor:pointer; font-size:12px;">
        Closed (${closed.length})
      </button>
    </div>
    <div style="overflow-y:auto; flex:1; padding:8px;">
      ${list.length === 0 ? `<div style="text-align:center; color:#666; padding:24px; font-size:13px;">No ${activeTab} reviews</div>` : ""}
      ${list.map(r => `
        <div class="rv-item" data-id="${r.id}" style="padding:10px 12px; margin-bottom:6px; background:#313244; border-radius:8px; cursor:pointer;">
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px;">
            <span style="font-size:8px; width:8px; height:8px; border-radius:50%; background:${statusColor(r.status)}; display:inline-block;"></span>
            <span style="font-weight:600; font-size:13px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(r.title)}</span>
            <span style="font-size:10px; color:#888; background:#45475a; padding:2px 6px; border-radius:4px;">${r.status}</span>
          </div>
          <div style="font-size:11px; color:#888;">Reviewer: ${esc(r.reviewer)} · ${timeAgo(r.updated_at)}</div>
        </div>
      `).join("")}
    </div>
  `;

  el.querySelector("#rv-close")?.addEventListener("click", () => { el.style.display = "none"; });
  el.querySelectorAll(".rv-tab").forEach(btn => btn.addEventListener("click", () => {
    activeTab = (btn as HTMLElement).dataset.tab as any;
    renderPanel(el, editor);
  }));
  el.querySelectorAll(".rv-item").forEach(item => item.addEventListener("click", () => {
    currentReviewId = Number((item as HTMLElement).dataset.id);
    renderPanel(el, editor);
  }));
}

function renderReviewDetail(el: HTMLElement, editor: Editor) {
  const review: ReviewRequest = JSON.parse((editor as any).engine.get_review(currentReviewId!));
  if (!review.id) { currentReviewId = null; renderPanel(el, editor); return; }
  const comments: ReviewComment[] = JSON.parse((editor as any).engine.get_review_comments(currentReviewId!));
  
  // Get branch diff
  let diff: BranchDiff = { added: [], modified: [], removed: [] };
  try { diff = JSON.parse((editor as any).engine.get_branch_diff(BigInt(review.branch_id))); } catch {}

  const unresolvedCount = comments.filter(c => !c.resolved).length;

  el.innerHTML = `
    <div style="padding:12px 16px; border-bottom:1px solid #333; display:flex; align-items:center; gap:8px;">
      <button id="rv-back" style="background:none; border:none; color:#89b4fa; cursor:pointer; font-size:14px;">←</button>
      <span style="font-weight:600; font-size:14px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(review.title)}</span>
      <span style="font-size:10px; background:${statusColor(review.status)}22; color:${statusColor(review.status)}; padding:2px 8px; border-radius:4px; border:1px solid ${statusColor(review.status)}44;">${review.status}</span>
    </div>
    <div style="overflow-y:auto; flex:1; padding:12px;">
      <!-- Description -->
      <div style="font-size:12px; color:#bac2de; margin-bottom:12px; white-space:pre-wrap;">${esc(review.description) || "<em style='color:#666'>No description</em>"}</div>
      <div style="font-size:11px; color:#666; margin-bottom:12px;">Reviewer: <strong>${esc(review.reviewer)}</strong></div>

      <!-- Diff summary -->
      <div style="margin-bottom:12px;">
        <div style="font-size:11px; font-weight:600; color:#888; margin-bottom:6px; text-transform:uppercase;">Changes</div>
        ${diff.added.length ? `<div style="font-size:12px; color:#a6e3a1; margin-bottom:2px;">+ ${diff.added.length} added</div>` : ""}
        ${diff.modified.length ? `<div style="font-size:12px; color:#f9e2af; margin-bottom:2px;">~ ${diff.modified.length} modified</div>` : ""}
        ${diff.removed.length ? `<div style="font-size:12px; color:#f38ba8; margin-bottom:2px;">- ${diff.removed.length} removed</div>` : ""}
        ${!diff.added.length && !diff.modified.length && !diff.removed.length ? `<div style="font-size:12px; color:#666;">No changes</div>` : ""}
      </div>

      <!-- Actions -->
      ${review.status === "Open" ? `
        <div style="display:flex; gap:8px; margin-bottom:16px;">
          <button id="rv-approve" style="flex:1; padding:6px 12px; background:#a6e3a1; color:#1e1e2e; border:none; border-radius:6px; cursor:pointer; font-weight:600; font-size:12px;">✓ Approve</button>
          <button id="rv-reject" style="flex:1; padding:6px 12px; background:#f38ba8; color:#1e1e2e; border:none; border-radius:6px; cursor:pointer; font-weight:600; font-size:12px;">✗ Reject</button>
        </div>
      ` : ""}
      ${review.status === "Approved" ? `
        <div style="margin-bottom:16px;">
          <button id="rv-merge" style="width:100%; padding:8px; background:#89b4fa; color:#1e1e2e; border:none; border-radius:6px; cursor:pointer; font-weight:700; font-size:13px;">↓↓ Merge</button>
        </div>
      ` : ""}

      <!-- Comments -->
      <div style="font-size:11px; font-weight:600; color:#888; margin-bottom:8px; text-transform:uppercase;">
        Comments (${comments.length})${unresolvedCount ? ` · ${unresolvedCount} unresolved` : ""}
      </div>
      ${comments.map(c => `
        <div class="rv-comment" style="padding:8px 10px; margin-bottom:6px; background:${c.resolved ? "#1e1e2e" : "#313244"}; border-radius:6px; border-left:3px solid ${c.resolved ? "#666" : (c.node_id ? "#89b4fa" : "#cba6f7")}; ${c.resolved ? "opacity:0.6;" : ""}">
          <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
            <span style="font-size:11px; font-weight:600;">${esc(c.author)}</span>
            <span style="font-size:10px; color:#666;">${timeAgo(c.timestamp)}</span>
          </div>
          <div style="font-size:12px; margin-bottom:4px;">${esc(c.text)}</div>
          <div style="display:flex; gap:8px; align-items:center;">
            ${c.node_id ? `<span style="font-size:10px; color:#89b4fa; cursor:pointer;" class="rv-goto-node" data-node="${c.node_id}">📍 Node #${c.node_id}</span>` : ""}
            ${!c.resolved ? `<button class="rv-resolve" data-cid="${c.id}" style="font-size:10px; color:#a6e3a1; background:none; border:none; cursor:pointer;">✓ Resolve</button>` : `<span style="font-size:10px; color:#666;">Resolved</span>`}
          </div>
        </div>
      `).join("")}

      <!-- Add comment -->
      <div style="margin-top:8px;">
        <textarea id="rv-comment-text" placeholder="Add a comment..." style="width:100%; height:60px; background:#181825; border:1px solid #333; border-radius:6px; color:#cdd6f4; padding:8px; font-size:12px; resize:vertical; box-sizing:border-box;"></textarea>
        <div style="display:flex; gap:8px; margin-top:6px; align-items:center;">
          <label style="font-size:11px; color:#888; flex:1;">
            <input type="checkbox" id="rv-attach-node" style="margin-right:4px;">Attach to selected node
          </label>
          <button id="rv-add-comment" style="padding:4px 12px; background:#cba6f7; color:#1e1e2e; border:none; border-radius:4px; cursor:pointer; font-weight:600; font-size:11px;">Post</button>
        </div>
      </div>
    </div>
  `;

  // Event handlers
  el.querySelector("#rv-back")?.addEventListener("click", () => { currentReviewId = null; renderPanel(el, editor); });
  el.querySelector("#rv-approve")?.addEventListener("click", () => {
    (editor as any).engine.approve_review(BigInt(review.id));
    renderPanel(el, editor);
  });
  el.querySelector("#rv-reject")?.addEventListener("click", () => {
    const reason = prompt("Rejection reason:");
    if (reason !== null) { (editor as any).engine.reject_review(BigInt(review.id), reason); renderPanel(el, editor); }
  });
  el.querySelector("#rv-merge")?.addEventListener("click", () => {
    if (confirm("Merge this branch?")) { (editor as any).engine.merge_review(BigInt(review.id)); renderPanel(el, editor); }
  });
  el.querySelector("#rv-add-comment")?.addEventListener("click", () => {
    const text = (el.querySelector("#rv-comment-text") as HTMLTextAreaElement)?.value.trim();
    if (!text) return;
    const attachNode = (el.querySelector("#rv-attach-node") as HTMLInputElement)?.checked;
    let nodeId = BigInt(0);
    if (attachNode) {
      const sel = (editor as any).engine.get_selection();
      const ids: number[] = JSON.parse(sel);
      if (ids.length > 0) nodeId = BigInt(ids[0]);
    }
    (editor as any).engine.add_review_comment(BigInt(review.id), nodeId, text, "You");
    renderPanel(el, editor);
  });
  el.querySelectorAll(".rv-resolve").forEach(btn => btn.addEventListener("click", () => {
    const cid = Number((btn as HTMLElement).dataset.cid);
    (editor as any).engine.resolve_review_comment(BigInt(cid));
    renderPanel(el, editor);
  }));
  el.querySelectorAll(".rv-goto-node").forEach(span => span.addEventListener("click", (e) => {
    e.stopPropagation();
    const nodeId = Number((span as HTMLElement).dataset.node);
    (editor as any).engine.set_selection(JSON.stringify([nodeId]));
    editor.zoomToSelection?.();
  }));
}

export function showCreateReviewModal(editor: Editor, branchId: number, onCreated: () => void) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center;";
  overlay.innerHTML = `
    <div style="background:#1e1e2e; border-radius:12px; padding:24px; width:380px; color:#cdd6f4; font-family:Inter,system-ui,sans-serif;">
      <h3 style="margin:0 0 16px; font-size:16px;">Request Review</h3>
      <label style="font-size:12px; color:#888;">Title</label>
      <input id="crm-title" style="width:100%; padding:8px; background:#181825; border:1px solid #333; border-radius:6px; color:#cdd6f4; margin:4px 0 12px; box-sizing:border-box; font-size:13px;" placeholder="Review title...">
      <label style="font-size:12px; color:#888;">Description</label>
      <textarea id="crm-desc" style="width:100%; height:60px; padding:8px; background:#181825; border:1px solid #333; border-radius:6px; color:#cdd6f4; margin:4px 0 12px; box-sizing:border-box; font-size:12px; resize:vertical;" placeholder="Describe the changes..."></textarea>
      <label style="font-size:12px; color:#888;">Reviewer</label>
      <input id="crm-reviewer" style="width:100%; padding:8px; background:#181825; border:1px solid #333; border-radius:6px; color:#cdd6f4; margin:4px 0 16px; box-sizing:border-box; font-size:13px;" placeholder="Reviewer name...">
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button id="crm-cancel" style="padding:8px 16px; background:#45475a; border:none; border-radius:6px; color:#cdd6f4; cursor:pointer;">Cancel</button>
        <button id="crm-create" style="padding:8px 16px; background:#cba6f7; color:#1e1e2e; border:none; border-radius:6px; cursor:pointer; font-weight:600;">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector("#crm-cancel")?.addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector("#crm-create")?.addEventListener("click", () => {
    const title = (overlay.querySelector("#crm-title") as HTMLInputElement).value.trim();
    const desc = (overlay.querySelector("#crm-desc") as HTMLTextAreaElement).value.trim();
    const reviewer = (overlay.querySelector("#crm-reviewer") as HTMLInputElement).value.trim();
    if (!title) { alert("Title is required"); return; }
    (editor as any).engine.create_review(BigInt(branchId), title, desc, reviewer || "Unassigned");
    overlay.remove();
    onCreated();
  });
  (overlay.querySelector("#crm-title") as HTMLInputElement)?.focus();
}

function statusColor(s: string): string {
  switch (s) {
    case "Open": return "#89b4fa";
    case "Approved": return "#a6e3a1";
    case "Rejected": return "#f38ba8";
    case "Merged": return "#cba6f7";
    default: return "#888";
  }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
