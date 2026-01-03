import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Connection } from '../entities/connection.entity';

interface ConnectedClient {
  socketId: string;
  userId: string;
  sessionId: string;
  permission: 'read' | 'control';
  isHost: boolean;
}

@Injectable()
export class RelayService {
  private clients: Map<string, ConnectedClient> = new Map();
  private sessionClients: Map<string, Set<string>> = new Map();

  constructor(
    @InjectRepository(Connection)
    private connectionsRepository: Repository<Connection>,
  ) {}

  addClient(client: ConnectedClient): void {
    this.clients.set(client.socketId, client);

    if (!this.sessionClients.has(client.sessionId)) {
      this.sessionClients.set(client.sessionId, new Set());
    }
    this.sessionClients.get(client.sessionId)!.add(client.socketId);
  }

  removeClient(socketId: string): void {
    const client = this.clients.get(socketId);
    if (client) {
      this.sessionClients.get(client.sessionId)?.delete(socketId);
      this.clients.delete(socketId);
    }
  }

  getClient(socketId: string): ConnectedClient | undefined {
    return this.clients.get(socketId);
  }

  getSessionClients(sessionId: string): ConnectedClient[] {
    const socketIds = this.sessionClients.get(sessionId);
    if (!socketIds) return [];

    return Array.from(socketIds)
      .map((id) => this.clients.get(id))
      .filter((c): c is ConnectedClient => c !== undefined);
  }

  getHostSocketId(sessionId: string): string | undefined {
    const clients = this.getSessionClients(sessionId);
    return clients.find((c) => c.isHost)?.socketId;
  }

  async recordConnection(
    sessionId: string,
    userId: string,
    codeUsed: string,
  ): Promise<Connection> {
    const connection = this.connectionsRepository.create({
      sessionId,
      userId,
      codeUsed,
    });
    return this.connectionsRepository.save(connection);
  }
}
