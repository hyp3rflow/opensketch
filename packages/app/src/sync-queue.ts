/**
 * Sync Queue — queues operations while offline, flushes when back online
 * Currently local-only; server sync integration ready for collab module.
 */

import { offlineStore } from "./offline-store";

const PENDING_KEY = "pending_ops";

export interface SyncOp {
  id: string;
  type: "scene_save" | "history_save";
  timestamp: number;
  data: string;
}

export class SyncQueue {
  private flushing = false;
  private onSyncHandlers: ((op: SyncOp) => Promise<boolean>)[] = [];

  /** Add an operation to the pending queue */
  async enqueue(op: Omit<SyncOp, "id" | "timestamp">) {
    const full: SyncOp = {
      ...op,
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    };
    const ops = await this.getPending();
    ops.push(full);
    await offlineStore.set(PENDING_KEY, ops);
  }

  /** Get all pending operations */
  async getPending(): Promise<SyncOp[]> {
    return (await offlineStore.get<SyncOp[]>(PENDING_KEY)) || [];
  }

  /** Get count of pending operations */
  async getPendingCount(): Promise<number> {
    const ops = await this.getPending();
    return ops.length;
  }

  /** Register a sync handler (returns true if synced successfully) */
  onSync(handler: (op: SyncOp) => Promise<boolean>) {
    this.onSyncHandlers.push(handler);
  }

  /** Flush all pending ops via registered handlers */
  async flush(): Promise<number> {
    if (this.flushing) return 0;
    this.flushing = true;
    let flushed = 0;

    try {
      const ops = await this.getPending();
      const remaining: SyncOp[] = [];

      for (const op of ops) {
        let synced = false;
        for (const handler of this.onSyncHandlers) {
          try {
            if (await handler(op)) { synced = true; break; }
          } catch { /* handler failed, keep op */ }
        }
        if (synced) flushed++;
        else remaining.push(op);
      }

      await offlineStore.set(PENDING_KEY, remaining);
    } finally {
      this.flushing = false;
    }

    return flushed;
  }

  /** Clear all pending ops */
  async clear() {
    await offlineStore.set(PENDING_KEY, []);
  }
}

export const syncQueue = new SyncQueue();
