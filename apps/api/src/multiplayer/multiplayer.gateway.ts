import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  CreateRoomPayloadSchema,
  JoinRoomPayloadSchema,
  MultiplayerEnvelopeSchema,
  SetReadyPayloadSchema,
  UpdateRoomSettingsPayloadSchema,
  WordSkipPayloadSchema,
  WordSolvePayloadSchema,
} from '@starspell/shared';
import type { Server, Socket } from 'socket.io';
import { AuthService, SESSION_COOKIE_NAME } from '../auth/auth.service.js';
import { getAllowedOrigins } from '../common/origin-header.guard.js';
import {
  MultiplayerError,
  MultiplayerService,
  type SocketIdentity,
} from './multiplayer.service.js';

interface AuthenticatedSocket extends Socket {
  data: {
    identity?: SocketIdentity;
  };
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

@WebSocketGateway({
  namespace: '/multiplayer',
  cors: {
    origin: Array.from(getAllowedOrigins()),
    credentials: true,
  },
})
export class MultiplayerGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly multiplayerService: MultiplayerService,
  ) {}

  afterInit(server: Server): void {
    this.multiplayerService.setBroadcaster({
      emitToRoom: (roomCode, event, payload) => {
        server.to(roomCode).emit(event, payload);
      },
      emitToSocket: (socketId, event, payload) => {
        server.to(socketId).emit(event, payload);
      },
      disconnectSocket: (socketId) => {
        const sock = server.sockets.sockets.get(socketId);
        if (sock) {
          sock.disconnect(true);
        }
      },
      joinSocketToRoom: (socketId, roomCode) => {
        const sock = server.sockets.sockets.get(socketId);
        if (sock) {
          void sock.join(roomCode);
        }
      },
      leaveSocketFromRoom: (socketId, roomCode) => {
        const sock = server.sockets.sockets.get(socketId);
        if (sock) {
          void sock.leave(roomCode);
        }
      },
    });
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const cookies = parseCookieHeader(client.handshake.headers.cookie);
    const token = cookies[SESSION_COOKIE_NAME];
    const session = await this.authService.authenticateToken(token);
    if (!session) {
      client.emit('error.event', {
        code: 'UNAUTHORIZED',
        message: 'Authentication required for multiplayer',
      });
      client.disconnect(true);
      return;
    }

    client.data.identity = {
      userId: session.userId,
      username: session.me.user.username,
      avatarId: session.me.profile.avatarId,
    };
  }

  async handleDisconnect(client: AuthenticatedSocket): Promise<void> {
    const identity = client.data.identity;
    if (!identity) return;
    await this.multiplayerService.handleDisconnect(identity.userId, client.id);
  }

  @SubscribeMessage('room.create')
  async onRoomCreate(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() raw: unknown) {
    return this.handleEnvelope(client, raw, async (identity, env) => {
      const payload = CreateRoomPayloadSchema.parse(env.payload);
      return this.multiplayerService.createRoom(identity, client.id, payload);
    });
  }

  @SubscribeMessage('room.join')
  async onRoomJoin(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() raw: unknown) {
    return this.handleEnvelope(client, raw, async (identity, env) => {
      const payload = JoinRoomPayloadSchema.parse(env.payload);
      return this.multiplayerService.joinRoom(identity, client.id, payload.code);
    });
  }

  @SubscribeMessage('room.leave')
  async onRoomLeave(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() raw: unknown) {
    return this.handleEnvelope(client, raw, async (identity, env) => {
      await this.multiplayerService.leaveRoom(identity.userId, env.roomCode, client.id);
      return { ok: true };
    });
  }

  @SubscribeMessage('room.ready')
  async onRoomReady(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() raw: unknown) {
    return this.handleEnvelope(client, raw, async (identity, env) => {
      const payload = SetReadyPayloadSchema.parse(env.payload);
      return this.multiplayerService.setReady(identity, env.roomCode, payload.ready);
    });
  }

  @SubscribeMessage('room.settings')
  async onRoomSettings(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() raw: unknown,
  ) {
    return this.handleEnvelope(client, raw, async (identity, env) => {
      const payload = UpdateRoomSettingsPayloadSchema.parse(env.payload);
      return this.multiplayerService.updateSettings(identity, env.roomCode, payload);
    });
  }

  @SubscribeMessage('room.start')
  async onRoomStart(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() raw: unknown) {
    return this.handleEnvelope(client, raw, async (identity, env) => {
      return this.multiplayerService.startMatch(identity, env.roomCode);
    });
  }

  @SubscribeMessage('word.solve')
  async onWordSolve(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() raw: unknown) {
    return this.handleEnvelope(client, raw, async (identity, env) => {
      const payload = WordSolvePayloadSchema.parse(env.payload);
      return this.multiplayerService.handleWordSolve(
        identity,
        env.roomCode,
        env.eventId,
        env.seq,
        payload.slot,
        payload.answer,
      );
    });
  }

  @SubscribeMessage('word.skip')
  async onWordSkip(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() raw: unknown) {
    return this.handleEnvelope(client, raw, async (identity, env) => {
      const payload = WordSkipPayloadSchema.parse(env.payload);
      return this.multiplayerService.handleWordSkip(
        identity,
        env.roomCode,
        env.eventId,
        env.seq,
        payload.slot,
      );
    });
  }

  private async handleEnvelope<T>(
    client: AuthenticatedSocket,
    raw: unknown,
    fn: (
      identity: SocketIdentity,
      env: ReturnType<typeof MultiplayerEnvelopeSchema.parse>,
    ) => Promise<T>,
  ): Promise<{ ok: true; data: T } | { ok: false; error: { code: string; message: string } }> {
    const identity = client.data.identity;
    if (!identity) {
      return {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      };
    }
    try {
      const env = MultiplayerEnvelopeSchema.parse(raw);
      const data = await fn(identity, env);
      return { ok: true, data };
    } catch (err) {
      if (err instanceof MultiplayerError) {
        return { ok: false, error: { code: err.code, message: err.message } };
      }
      return {
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: err instanceof Error ? err.message : 'Invalid multiplayer request',
        },
      };
    }
  }
}
