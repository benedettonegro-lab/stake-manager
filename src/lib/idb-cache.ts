/**
 * IndexedDB cache per dati app (offline-first, reopen istantaneo).
 * Store per namespace; payload JSON con TTL.
 */

const DB_NAME = "stake_manager_v1";
const DB_VERSION = 1;
const STORE = "kv";

type Row = { key: string; at: number; payload: unknown };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("idb open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
  });
}

export async function idbRead<T>(key: string, ttlMs: number): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const get = store.get(key);
      get.onsuccess = () => {
        const row = get.result as Row | undefined;
        db.close();
        if (!row || Date.now() - row.at > ttlMs) {
          resolve(null);
          return;
        }
        resolve(row.payload as T);
      };
      get.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

export async function idbWrite<T>(key: string, payload: T): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      store.put({ key, at: Date.now(), payload } satisfies Row);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    /* quota / private mode */
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    /* ignore */
  }
}

export function idbKey(userId: string, ns: string): string {
  return `${userId}::${ns}`;
}
