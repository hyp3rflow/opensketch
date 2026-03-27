/**
 * Sync status indicator — shows online/offline state + pending changes
 */

import { syncQueue } from "../sync-queue";

export function setupSyncStatus(parent: HTMLElement): { update: () => void } {
  const el = document.createElement("div");
  el.className = "sync-status";
  el.style.cssText = `
    position: fixed; top: 8px; right: 320px; z-index: 999;
    display: flex; align-items: center; gap: 6px;
    padding: 4px 10px; border-radius: 12px;
    font-size: 11px; font-family: -apple-system, sans-serif;
    background: rgba(30,30,30,0.85); color: #ccc;
    backdrop-filter: blur(8px);
    transition: opacity 0.3s;
    pointer-events: none;
  `;
  parent.appendChild(el);

  let isOnline = navigator.onLine;
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  async function update() {
    isOnline = navigator.onLine;
    const pending = await syncQueue.getPendingCount();

    if (isOnline && pending === 0) {
      // Hide when online with no pending
      el.style.opacity = "0";
      return;
    }

    const dot = isOnline ? "🟢" : "🔴";
    const label = isOnline ? "Online" : "Offline";
    const pendingText = pending > 0 ? ` · ${pending} pending` : "";
    el.textContent = `${dot} ${label}${pendingText}`;
    el.style.opacity = "1";

    // Auto-hide online status after 3s
    if (isOnline && pending === 0) {
      if (hideTimeout) clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => { el.style.opacity = "0"; }, 3000);
    }
  }

  window.addEventListener("online", async () => {
    await update();
    // Auto-flush on reconnect
    const flushed = await syncQueue.flush();
    if (flushed > 0) await update();
  });

  window.addEventListener("offline", () => update());
  update();

  return { update };
}
