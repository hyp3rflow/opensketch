/**
 * Sync Queue — queues operations while offline, flushes when back online.
 * Supports both legacy scene_save ops and CRDT operation-level sync.
 */

import { offlineStore } from "./offline-store";

const PENDING_KEY = "pending_ops";
const CRDT_PENDING_KEY = "crdt_pending_ops";

export interface SyncOp {
  id: string;
  type: "scene_save" | "history_save";
  timestamp: number;
  data: string;
}

/** CRDT operation from the Rust engine */
export interface CRDTOperation {
  id: string;
  site_id: string;
  clock: Record<string, number>;
  timestamp: number;
  kind: Record<string, unknown>;
}

/** Merge result from applying remote operations */
export interface MergeResult {
  applied: CRDTOperation[];
  rejected: string[];
  error?: string;
}

export class SyncQueue {
  private flushing = false;
  private onSyncHandlers: ((op: SyncOp) => Promise<boolean>)[] = [];
  private onCRDTSyncHandlers: ((ops: CRDTOperation[]) => Promise<boolean>)[] = [];

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

  /** Enqueue CRDT operations for remote sync */
  async enqueueCRDT(ops: CRDTOperation[]) {
    if (ops.length === 0) return;
    const existing = await this.getCRDTPending();
    existing.push(...ops);
    await offlineStore.set(CRDT_PENDING_KEY, existing);
  }

  /** Get all pending operations */
  async getPending(): Promise<SyncOp[]> {
    return (await offlineStore.get<SyncOp[]>(PENDING_KEY)) || [];
  }

  /** Get pending CRDT operations */
  async getCRDTPending(): Promise<CRDTOperation[]> {
    return (await offlineStore.get<CRDTOperation[]>(CRDT_PENDING_KEY)) || [];
  }

  /** Get count of pending operations */
  async getPendingCount(): Promise<number> {
    const ops = await this.getPending();
    const crdtOps = await this.getCRDTPending();
    return ops.length + crdtOps.length;
  }

  /** Register a sync handler (returns true if synced successfully) */
  onSync(handler: (op: SyncOp) => Promise<boolean>) {
    this.onSyncHandlers.push(handler);
  }

  /** Register a CRDT sync handler */
  onCRDTSync(handler: (ops: CRDTOperation[]) => Promise<boolean>) {
    this.onCRDTSyncHandlers.push(handler);
  }

  /** Flush all pending ops via registered handlers */
  async flush(): Promise<number> {
    if (this.flushing) return 0;
    this.flushing = true;
    let flushed = 0;

    try {
      // Flush legacy ops
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

      // Flush CRDT ops
      const crdtOps = await this.getCRDTPending();
      if (crdtOps.length > 0) {
        let crdtSynced = false;
        for (const handler of this.onCRDTSyncHandlers) {
          try {
            if (await handler(crdtOps)) { crdtSynced = true; break; }
          } catch { /* handler failed */ }
        }
        if (crdtSynced) {
          flushed += crdtOps.length;
          await offlineStore.set(CRDT_PENDING_KEY, []);
        }
      }
    } finally {
      this.flushing = false;
    }

    return flushed;
  }

  /** Clear all pending ops */
  async clear() {
    await offlineStore.set(PENDING_KEY, []);
    await offlineStore.set(CRDT_PENDING_KEY, []);
  }
}

export const syncQueue = new SyncQueue();
