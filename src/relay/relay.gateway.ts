import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { RelayService } from './relay.service';
import { CodesService } from '../codes/codes.service';
import { SessionsService } from '../sessions/sessions.service';

interface JoinHostPayload {
  token: string;
  sessionId: string;
}

interface JoinGuestPayload {
  token: string;
  code: string;
  guestPublicKey: string;
}

interface RelayPayload {
  encryptedData: string;
  nonce: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/relay',
})
export class RelayGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private relayService: RelayService,
    private codesService: CodesService,
    private sessionsService: SessionsService,
  ) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const clientData = this.relayService.getClient(client.id);
    if (clientData) {
      // Notify others in session
      const sessionClients = this.relayService.getSessionClients(
        clientData.sessionId,
      );
      sessionClients.forEach((c) => {
        if (c.socketId !== client.id) {
          this.server.to(c.socketId).emit('peerDisconnected', {
            userId: clientData.userId,
            isHost: clientData.isHost,
          });
        }
      });

      this.relayService.removeClient(client.id);
    }
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinAsHost')
  async handleJoinAsHost(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinHostPayload,
  ) {
    try {
      const decoded = this.jwtService.verify(payload.token);
      const session = await this.sessionsService.findById(payload.sessionId);

      if (!session || session.hostUserId !== decoded.sub) {
        return { error: 'Unauthorized' };
      }

      this.relayService.addClient({
        socketId: client.id,
        userId: decoded.sub,
        sessionId: payload.sessionId,
        permission: 'control',
        isHost: true,
      });

      client.join(payload.sessionId);

      return { success: true };
    } catch (e) {
      return { error: 'Invalid token' };
    }
  }

  @SubscribeMessage('joinAsGuest')
  async handleJoinAsGuest(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinGuestPayload,
  ) {
    try {
      const decoded = this.jwtService.verify(payload.token);
      const validation = await this.codesService.validate(payload.code);

      if (!validation.valid) {
        return { error: validation.error };
      }

      const session = validation.session!;
      const permission = validation.permission!;

      // Increment code usage
      await this.codesService.incrementUsage(payload.code);

      // Record connection
      await this.relayService.recordConnection(
        session.id,
        decoded.sub,
        payload.code,
      );

      this.relayService.addClient({
        socketId: client.id,
        userId: decoded.sub,
        sessionId: session.id,
        permission,
        isHost: false,
      });

      client.join(session.id);

      // Notify host of new guest
      const hostSocketId = this.relayService.getHostSocketId(session.id);
      if (hostSocketId) {
        this.server.to(hostSocketId).emit('guestJoined', {
          guestPublicKey: payload.guestPublicKey,
          userId: decoded.sub,
          permission,
        });
      }

      return {
        success: true,
        hostPublicKey: session.hostPublicKey,
        hostUsername: session.host.username,
        sessionName: session.sessionName || 'Shared Session',
        permission,
      };
    } catch (e) {
      return { error: 'Invalid token' };
    }
  }

  @SubscribeMessage('relay')
  handleRelay(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: RelayPayload,
  ) {
    const clientData = this.relayService.getClient(client.id);
    if (!clientData) {
      return { error: 'Not connected to a session' };
    }

    // Check permission for input
    if (!clientData.isHost && clientData.permission === 'read') {
      return { error: 'Read-only permission' };
    }

    // Relay to all others in the session
    const sessionClients = this.relayService.getSessionClients(
      clientData.sessionId,
    );

    sessionClients.forEach((c) => {
      if (c.socketId !== client.id) {
        this.server.to(c.socketId).emit('relayData', {
          from: clientData.isHost ? 'host' : 'guest',
          encryptedData: payload.encryptedData,
          nonce: payload.nonce,
        });
      }
    });

    return { success: true };
  }

  @SubscribeMessage('keyExchange')
  handleKeyExchange(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { targetUserId: string; publicKey: string },
  ) {
    const clientData = this.relayService.getClient(client.id);
    if (!clientData) {
      return { error: 'Not connected' };
    }

    const sessionClients = this.relayService.getSessionClients(
      clientData.sessionId,
    );
    const target = sessionClients.find(
      (c) => c.userId === payload.targetUserId,
    );

    if (target) {
      this.server.to(target.socketId).emit('keyExchange', {
        fromUserId: clientData.userId,
        publicKey: payload.publicKey,
      });
    }

    return { success: true };
  }
}
