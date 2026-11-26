import type { DifficultyKey, SoloSyncEventInput, WayfaringStyle } from '@starspell/shared';

const DB_NAME = 'starspell_sync_v1';
const DB_VERSION = 1;
const STORE_SESSION = 'active_session';
const STORE_OUTBOX = 'outbox';

export interface LocalSyncSession {
  key: 'current';
  userId: string;
  clientSessionId: string;
  serverSessionId: string | null;
  seed: number;
  difficulty: DifficultyKey;
  style: WayfaringStyle;
  wordBankVersion: string;
  baseSeq: number;
  nextSeq: number;
}

export interface OutboxEntry {
  eventId: string;
  userId: string;
  clientSessionId: string;
  event: SoloSyncEventInput;
  createdAt: number;
}

const memoryFallback = {
  session: null as LocalSyncSession | null,
  outbox: [] as OutboxEntry[],
};

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_SESSION)) {
          db.createObjectStore(STORE_SESSION, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
          const store = db.createObjectStore(STORE_OUTBOX, { keyPath: 'eventId' });
          store.createIndex('by_seq', 'event.seq', { unique: false });
        }
      };
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

export async function loadLocalSyncSession(): Promise<LocalSyncSession | null> {
  const db = await openDb();
  if (!db) return memoryFallback.session;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_SESSION, 'readonly');
      const req = tx.objectStore(STORE_SESSION).get('current');
      req.onsuccess = () => {
        resolve((req.result as LocalSyncSession | undefined) ?? null);
      };
      req.onerror = () => {
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });
}

export async function saveLocalSyncSession(session: LocalSyncSession): Promise<void> {
  const db = await openDb();
  if (!db) {
    memoryFallback.session = session;
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_SESSION, 'readwrite');
      tx.objectStore(STORE_SESSION).put(session);
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        resolve();
      };
    } catch {
      resolve();
    }
  });
}

export async function clearLocalSyncSession(): Promise<void> {
  const db = await openDb();
  if (!db) {
    memoryFallback.session = null;
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_SESSION, 'readwrite');
      tx.objectStore(STORE_SESSION).delete('current');
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        resolve();
      };
    } catch {
      resolve();
    }
  });
}

export async function enqueueOutboxEvent(entry: OutboxEntry): Promise<void> {
  const db = await openDb();
  if (!db) {
    memoryFallback.outbox.push(entry);
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      tx.objectStore(STORE_OUTBOX).put(entry);
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        resolve();
      };
    } catch {
      resolve();
    }
  });
}

export async function listOutboxEvents(clientSessionId: string): Promise<OutboxEntry[]> {
  const db = await openDb();
  if (!db) {
    return memoryFallback.outbox
      .filter((e) => e.clientSessionId === clientSessionId)
      .sort((a, b) => a.event.seq - b.event.seq);
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_OUTBOX, 'readonly');
      const req = tx.objectStore(STORE_OUTBOX).getAll();
      req.onsuccess = () => {
        const all = (req.result as OutboxEntry[] | undefined) ?? [];
        resolve(
          all
            .filter((e) => e.clientSessionId === clientSessionId)
            .sort((a, b) => a.event.seq - b.event.seq),
        );
      };
      req.onerror = () => {
        resolve([]);
      };
    } catch {
      resolve([]);
    }
  });
}

export async function removeOutboxEvents(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  const db = await openDb();
  if (!db) {
    const idSet = new Set(eventIds);
    memoryFallback.outbox = memoryFallback.outbox.filter((e) => !idSet.has(e.eventId));
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_OUTBOX, 'readwrite');
      const store = tx.objectStore(STORE_OUTBOX);
      for (const id of eventIds) {
        store.delete(id);
      }
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        resolve();
      };
    } catch {
      resolve();
    }
  });
}

export async function clearOutboxForSession(clientSessionId: string): Promise<void> {
  const entries = await listOutboxEvents(clientSessionId);
  await removeOutboxEvents(entries.map((e) => e.eventId));
}
