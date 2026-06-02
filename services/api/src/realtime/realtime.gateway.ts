import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

/**
 * One Socket.IO room per user: `user:{userId}`. The client never publishes
 * — every write goes through HTTPS so we keep idempotency + retries in one
 * code path. Server-emitted events (typed):
 *   quote.tick         { ticker, ltp, change, changePct, t }
 *   portfolio.changed  { tickers[], brokerIds[] }
 *   watchlist.changed  { watchlistId }
 *   import.progress    { importId, status, rowsProcessed }
 *   dividend.received  { ticker, amount, depositDate }
 *   meta.refreshed     { tickers[] }
 */
@WebSocketGateway({
  path: '/ws',
  cors: { origin: process.env['WEB_ORIGIN'] ?? '*', credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  async handleConnection(client: Socket) {
    // JWT auth handshake — verify Supabase JWT, extract userId, join room.
    // Stubbed; real verification in Step 2 once auth module is wired.
    const userId = (client.handshake.auth?.['userId'] ?? null) as string | null;
    if (!userId) {
      client.disconnect(true);
      return;
    }
    await client.join(`user:${userId}`);
    this.log.log(`ws connect userId=${userId} sid=${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.log.log(`ws disconnect sid=${client.id}`);
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}
