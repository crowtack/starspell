import {
  MAX_SOLO_EVENT_BATCH,
  SOLO_WORD_BANK_VERSION,
  type DifficultyKey,
  type SoloSessionDto,
  type SoloSyncEventInput,
  type SyncStatus,
  type WayfaringStyle,
} from '@starspell/shared';
import { ApiError } from '../api/client';
import { abandonSoloSession, appendSoloEvents, createSoloSession } from '../api/solo';
import {
  clearLocalSyncSession,
  clearOutboxForSession,
  enqueueOutboxEvent,
  listOutboxEvents,
  loadLocalSyncSession,
  removeOutboxEvents,
  saveLocalSyncSession,
  type LocalSyncSession,
} from './outboxDb';

export interface SyncConflictInfo {
  readonly localSession: LocalSyncSession;
  readonly serverSession: SoloSessionDto | null;
  readonly pendingCount: number;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000] as const;

export class SoloSyncManager {
  private status: SyncStatus =
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced';
  private activeSession: LocalSyncSession | null = null;
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private listeners = new Set<(status: SyncStatus) => void>();
  private conflictListeners = new Set<(conflict: SyncConflictInfo) => void>();
  private syncedListeners = new Set<(session: SoloSessionDto) => void>();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
  }

  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    this.clearRetryTimer();
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  getActiveLocalSession(): LocalSyncSession | null {
    return this.activeSession;
  }

  onStatusChange(cb: (status: SyncStatus) => void): () => void {
    this.listeners.add(cb);
    cb(this.status);
    return () => this.listeners.delete(cb);
  }

  onConflict(cb: (conflict: SyncConflictInfo) => void): () => void {
    this.conflictListeners.add(cb);
    return () => this.conflictListeners.delete(cb);
  }

  onServerSynced(cb: (session: SoloSessionDto) => void): () => void {
    this.syncedListeners.add(cb);
    return () => this.syncedListeners.delete(cb);
  }

  private setStatus(next: SyncStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const cb of this.listeners) {
      cb(next);
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private handleOnline = (): void => {
    this.retryAttempt = 0;
    this.clearRetryTimer();
    void this.flush();
  };

  private handleOffline = (): void => {
    this.clearRetryTimer();
    this.setStatus('offline');
  };

  async hydrateFromDisk(userId: string): Promise<LocalSyncSession | null> {
    const saved = await loadLocalSyncSession();
    if (saved && saved.userId === userId) {
      this.activeSession = saved;
      const pending = await listOutboxEvents(saved.clientSessionId);
      if (pending.length > 0) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          this.setStatus('offline');
        } else {
          void this.flush();
        }
      }
      return saved;
    }
    return null;
  }

  async adoptServerSession(userId: string, serverSession: SoloSessionDto): Promise<void> {
    const local: LocalSyncSession = {
      key: 'current',
      userId,
      clientSessionId: serverSession.clientSessionId,
      serverSessionId: serverSession.id,
      seed: serverSession.seed,
      difficulty: serverSession.difficulty,
      style: serverSession.style,
      wordBankVersion: serverSession.wordBankVersion,
      baseSeq: serverSession.version,
      nextSeq: serverSession.version + 1,
    };
    this.activeSession = local;
    await saveLocalSyncSession(local);
    this.setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced');
  }

  async startNewSession(params: {
    userId: string;
    difficulty: DifficultyKey;
    style: WayfaringStyle;
    seed: number;
  }): Promise<LocalSyncSession> {
    if (this.activeSession) {
      await clearOutboxForSession(this.activeSession.clientSessionId);
    }
    const local: LocalSyncSession = {
      key: 'current',
      userId: params.userId,
      clientSessionId: crypto.randomUUID(),
      serverSessionId: null,
      seed: params.seed,
      difficulty: params.difficulty,
      style: params.style,
      wordBankVersion: SOLO_WORD_BANK_VERSION,
      baseSeq: 0,
      nextSeq: 1,
    };
    this.activeSession = local;
    await saveLocalSyncSession(local);
    return local;
  }

  async recordEvent(eventWithoutSeq: Omit<SoloSyncEventInput, 'eventId' | 'seq'>): Promise<void> {
    if (!this.activeSession) return;
    const seq = this.activeSession.nextSeq;
    const eventId = crypto.randomUUID();
    const fullEvent: SoloSyncEventInput = {
      ...eventWithoutSeq,
      eventId,
      seq,
    };
    this.activeSession = {
      ...this.activeSession,
      nextSeq: seq + 1,
    };
    await saveLocalSyncSession(this.activeSession);
    await enqueueOutboxEvent({
      eventId,
      userId: this.activeSession.userId,
      clientSessionId: this.activeSession.clientSessionId,
      event: fullEvent,
      createdAt: Date.now(),
    });

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setStatus('offline');
      return;
    }

    this.setStatus('saving');
    void this.flush();
  }

  async abandonCurrent(reason: 'user' | 'conflict' = 'user'): Promise<void> {
    const current = this.activeSession;
    this.activeSession = null;
    this.clearRetryTimer();
    if (current) {
      await clearOutboxForSession(current.clientSessionId);
      await clearLocalSyncSession();
      if (current.serverSessionId) {
        await abandonSoloSession(current.serverSessionId, { reason }).catch(() => undefined);
      }
    }
    this.setStatus(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced');
  }

  async resolveConflictKeepServer(serverSession: SoloSessionDto): Promise<void> {
    const current = this.activeSession;
    if (current) {
      await clearOutboxForSession(current.clientSessionId);
      if (current.serverSessionId && current.serverSessionId !== serverSession.id) {
        await abandonSoloSession(current.serverSessionId, { reason: 'conflict' }).catch(
          () => undefined,
        );
      }
    }
    await this.adoptServerSession(current?.userId ?? '', serverSession);
  }

  async resolveConflictKeepLocal(serverSessionIdToAbandon: string | null): Promise<void> {
    if (serverSessionIdToAbandon) {
      await abandonSoloSession(serverSessionIdToAbandon, { reason: 'conflict' }).catch(
        () => undefined,
      );
    }
    const current = this.activeSession;
    if (!current) return;
    const entries = await listOutboxEvents(current.clientSessionId);
    // Re-number outbox events into a fresh clientSessionId if needed so server creates a clean session
    const newClientSessionId = crypto.randomUUID();
    await clearOutboxForSession(current.clientSessionId);
    const nextSession: LocalSyncSession = {
      ...current,
      clientSessionId: newClientSessionId,
      serverSessionId: null,
      baseSeq: 0,
      nextSeq: entries.length + 1,
    };
    this.activeSession = nextSession;
    await saveLocalSyncSession(nextSession);
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (!entry) continue;
      await enqueueOutboxEvent({
        ...entry,
        clientSessionId: newClientSessionId,
        event: {
          ...entry.event,
          seq: i + 1,
        },
      });
    }
    this.retryAttempt = 0;
    void this.flush();
  }

  async flush(): Promise<void> {
    if (this.flushing || !this.activeSession) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.setStatus('offline');
      return;
    }

    this.flushing = true;
    try {
      for (;;) {
        let currentSession = this.getActiveLocalSession();
        if (!currentSession) {
          return;
        }
        const pending = await listOutboxEvents(currentSession.clientSessionId);
        if (pending.length === 0) {
          this.retryAttempt = 0;
          this.setStatus('synced');
          return;
        }

        this.setStatus('saving');

        let serverSessionId: string | null = currentSession.serverSessionId;
        if (!serverSessionId) {
          const created = await createSoloSession({
            clientSessionId: currentSession.clientSessionId,
            difficulty: currentSession.difficulty,
            style: currentSession.style,
            seed: currentSession.seed,
            wordBankVersion: currentSession.wordBankVersion,
          });
          serverSessionId = created.id;
          currentSession = {
            ...currentSession,
            serverSessionId,
            baseSeq: created.version,
          };
          this.activeSession = currentSession;
          await saveLocalSyncSession(currentSession);
        }

        const batch = pending.slice(0, MAX_SOLO_EVENT_BATCH);
        const result = await appendSoloEvents(serverSessionId, {
          baseSeq: currentSession.baseSeq,
          events: batch.map((e) => e.event),
        });

        await removeOutboxEvents(batch.map((e) => e.eventId));
        currentSession = {
          ...currentSession,
          baseSeq: result.session.version,
        };
        this.activeSession = currentSession;
        await saveLocalSyncSession(currentSession);
        this.retryAttempt = 0;

        for (const cb of this.syncedListeners) {
          cb(result.session);
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const current = this.getActiveLocalSession();
        if (!current) return;
        this.setStatus('needs_attention');
        const pending = await listOutboxEvents(current.clientSessionId);
        for (const cb of this.conflictListeners) {
          cb({
            localSession: current,
            serverSession: null,
            pendingCount: pending.length,
          });
        }
        return;
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.setStatus('offline');
        return;
      }

      if (this.retryAttempt >= BACKOFF_MS.length) {
        this.setStatus('needs_attention');
        return;
      }

      const delay = BACKOFF_MS[this.retryAttempt] ?? 30_000;
      this.retryAttempt += 1;
      this.setStatus('saving');
      this.clearRetryTimer();
      this.retryTimer = setTimeout(() => {
        void this.flush();
      }, delay);
    } finally {
      this.flushing = false;
    }
  }
}
