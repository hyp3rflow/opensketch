/**
 * IndexedDB-based offline storage for OpenSketch
 * Replaces localStorage for scene data — no size limits, async API
 */

const DB_NAME = "opensketch";
const DB_VERSION = 1;
const STORE_NAME = "files";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return openDB().then(db => db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class OfflineStore {
  async get<T = any>(key: string): Promise<T | undefined> {
    const store = await tx("readonly");
    return wrap<T | undefined>(store.get(key));
  }

  async set(key: string, value: any): Promise<void> {
    const store = await tx("readwrite");
    await wrap(store.put(value, key));
  }

  async delete(key: string): Promise<void> {
    const store = await tx("readwrite");
    await wrap(store.delete(key));
  }

  async keys(): Promise<string[]> {
    const store = await tx("readonly");
    return wrap(store.getAllKeys()) as Promise<string[]>;
  }
}

/** Singleton */
export const offlineStore = new OfflineStore();
