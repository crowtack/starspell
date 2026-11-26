import { io, type Socket } from 'socket.io-client';
import {
  MULTIPLAYER_ENVELOPE_VERSION,
  type MatchHistoryItem,
  type MatchResultsPayload,
  type OpponentProgress,
  type RoomSnapshot,
  type WordIssuePayload,
} from '@starspell/shared';
import { apiRequest } from '../api/client';

const DEFAULT_API_URL =
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : 'http://localhost:3001';
const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? DEFAULT_API_URL;

export interface SocketAck<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export class MultiplayerSocketClient {
  private socket: Socket | null = null;
  private seq = 0;

  connect(handlers: {
    onConnect?: () => void;
    onDisconnect?: () => void;
    onRoomState?: (room: RoomSnapshot) => void;
    onWordIssue?: (issue: WordIssuePayload) => void;
    onMatchProgress?: (opponents: OpponentProgress[]) => void;
    onMatchResults?: (results: MatchResultsPayload) => void;
    onSessionReplaced?: (info: { code: string; message: string }) => void;
  }): void {
    this.disconnect();
    const sock = io(`${API_BASE_URL}/multiplayer`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    this.socket = sock;

    sock.on('connect', () => handlers.onConnect?.());
    sock.on('disconnect', () => handlers.onDisconnect?.());
    sock.on('room.state', (room: RoomSnapshot) => handlers.onRoomState?.(room));
    sock.on('word.issue', (issue: WordIssuePayload) => handlers.onWordIssue?.(issue));
    sock.on('match.progress', (opponents: OpponentProgress[]) =>
      handlers.onMatchProgress?.(opponents),
    );
    sock.on('match.results', (results: MatchResultsPayload) => handlers.onMatchResults?.(results));
    sock.on('session.replaced', (info: { code: string; message: string }) =>
      handlers.onSessionReplaced?.(info),
    );
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.seq = 0;
  }

  resetSeq(): void {
    this.seq = 0;
  }

  emitCommand<T>(
    type: string,
    roomCode: string,
    payload: unknown,
    options: { incrementSeq?: boolean; matchId?: string } = {},
  ): Promise<SocketAck<T>> {
    const sock = this.socket;
    if (!sock || !sock.connected) {
      return Promise.resolve({
        ok: false,
        error: { code: 'DISCONNECTED', message: 'Not connected to multiplayer server' },
      });
    }
    const seq = options.incrementSeq ? ++this.seq : 0;
    return new Promise((resolve) => {
      sock.emit(
        type,
        {
          v: MULTIPLAYER_ENVELOPE_VERSION,
          type,
          eventId: crypto.randomUUID(),
          seq,
          roomCode,
          ...(options.matchId ? { matchId: options.matchId } : {}),
          ts: Date.now(),
          payload,
        },
        (ack: SocketAck<T>) => {
          resolve(ack);
        },
      );
    });
  }
}

export async function fetchMultiplayerHistory(): Promise<MatchHistoryItem[]> {
  const res = await apiRequest<{ items: MatchHistoryItem[] }>('/api/multiplayer/history');
  return res.items;
}
