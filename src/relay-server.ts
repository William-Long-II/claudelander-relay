/**
 * Minimal WebSocket Relay Server
 *
 * Routes messages between desktop and mobile clients.
 * - Desktop connects with desktopId
 * - Mobile connects with desktopId + deviceToken
 * - Relay forwards messages; desktop validates tokens
 */

import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage as HttpIncomingMessage } from 'http';
import type {
  IncomingMessage,
  OutgoingMessage,
  DesktopConnectMessage,
  MobileConnectMessage,
  RelayMessage,
} from './types';

interface DesktopClient {
  socket: WebSocket;
  desktopId: string;
  connectedAt: number;
}

interface MobileClient {
  socket: WebSocket;
  desktopId: string;
  deviceToken: string;
  connectedAt: number;
}

export class RelayServer {
  private wss: WebSocketServer;
  private desktops: Map<string, DesktopClient> = new Map(); // desktopId -> client
  private mobiles: Map<string, Set<MobileClient>> = new Map(); // desktopId -> Set of mobile clients
  private socketToDesktop: Map<WebSocket, string> = new Map(); // socket -> desktopId
  private socketToMobile: Map<WebSocket, { desktopId: string; deviceToken: string }> = new Map();

  constructor(port: number = 3000) {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (socket, request) => {
      this.handleConnection(socket, request);
    });

    this.wss.on('error', (error) => {
      console.error('[Relay] Server error:', error);
    });

    console.log(`[Relay] WebSocket server listening on port ${port}`);

    // Periodic cleanup of stale connections
    setInterval(() => this.cleanupStaleConnections(), 30000);
  }

  private handleConnection(socket: WebSocket, _request: HttpIncomingMessage): void {
    console.log('[Relay] New connection');

    socket.on('message', (data) => {
      try {
        const message: IncomingMessage = JSON.parse(data.toString());
        this.handleMessage(socket, message);
      } catch (error) {
        console.error('[Relay] Failed to parse message:', error);
        this.sendError(socket, 'Invalid message format');
      }
    });

    socket.on('close', () => {
      this.handleDisconnect(socket);
    });

    socket.on('error', (error) => {
      console.error('[Relay] Socket error:', error);
    });

    // Set ping interval for keepalive
    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);

    socket.on('close', () => clearInterval(pingInterval));
  }

  private handleMessage(socket: WebSocket, message: IncomingMessage): void {
    switch (message.type) {
      case 'desktop:connect':
        this.handleDesktopConnect(socket, message);
        break;
      case 'mobile:connect':
        this.handleMobileConnect(socket, message);
        break;
      case 'relay':
        this.handleRelay(socket, message);
        break;
      case 'ping':
        this.send(socket, { type: 'pong' });
        break;
      default:
        this.sendError(socket, `Unknown message type: ${(message as { type: string }).type}`);
    }
  }

  private handleDesktopConnect(socket: WebSocket, message: DesktopConnectMessage): void {
    const { desktopId } = message;

    if (!desktopId) {
      this.sendError(socket, 'Missing desktopId');
      return;
    }

    // Check if desktop is already connected
    const existing = this.desktops.get(desktopId);
    if (existing && existing.socket.readyState === WebSocket.OPEN) {
      // Close old connection
      console.log(`[Relay] Desktop ${desktopId} reconnecting, closing old connection`);
      existing.socket.close(1000, 'Reconnecting from new location');
    }

    // Register desktop
    const client: DesktopClient = {
      socket,
      desktopId,
      connectedAt: Date.now(),
    };

    this.desktops.set(desktopId, client);
    this.socketToDesktop.set(socket, desktopId);

    console.log(`[Relay] Desktop ${desktopId} connected`);

    // Notify any waiting mobile clients
    const mobileClients = this.mobiles.get(desktopId);
    if (mobileClients) {
      for (const mobile of mobileClients) {
        if (mobile.socket.readyState === WebSocket.OPEN) {
          this.send(mobile.socket, { type: 'desktop:connected' });
          // Notify desktop of existing mobile connection
          this.send(socket, { type: 'mobile:connected', deviceToken: mobile.deviceToken });
        }
      }
    }
  }

  private handleMobileConnect(socket: WebSocket, message: MobileConnectMessage): void {
    const { desktopId, deviceToken } = message;

    if (!desktopId || !deviceToken) {
      this.sendError(socket, 'Missing desktopId or deviceToken');
      return;
    }

    // Register mobile client
    const client: MobileClient = {
      socket,
      desktopId,
      deviceToken,
      connectedAt: Date.now(),
    };

    let mobileSet = this.mobiles.get(desktopId);
    if (!mobileSet) {
      mobileSet = new Set();
      this.mobiles.set(desktopId, mobileSet);
    }
    mobileSet.add(client);

    this.socketToMobile.set(socket, { desktopId, deviceToken });

    console.log(`[Relay] Mobile connected for desktop ${desktopId}`);

    // Check if desktop is connected
    const desktop = this.desktops.get(desktopId);
    if (desktop && desktop.socket.readyState === WebSocket.OPEN) {
      // Notify mobile that desktop is available
      this.send(socket, { type: 'desktop:connected' });
      // Notify desktop of mobile connection
      this.send(desktop.socket, { type: 'mobile:connected', deviceToken });
    }
  }

  private handleRelay(socket: WebSocket, message: RelayMessage): void {
    // Check if sender is desktop or mobile
    const desktopId = this.socketToDesktop.get(socket);
    if (desktopId) {
      // Desktop sending to mobile(s)
      this.relayToMobiles(desktopId, message.payload);
      return;
    }

    const mobileInfo = this.socketToMobile.get(socket);
    if (mobileInfo) {
      // Mobile sending to desktop
      this.relayToDesktop(mobileInfo.desktopId, mobileInfo.deviceToken, message.payload);
      return;
    }

    this.sendError(socket, 'Not authenticated - send desktop:connect or mobile:connect first');
  }

  private relayToDesktop(desktopId: string, deviceToken: string, payload: unknown): void {
    const desktop = this.desktops.get(desktopId);
    if (!desktop || desktop.socket.readyState !== WebSocket.OPEN) {
      console.log(`[Relay] Desktop ${desktopId} not connected, cannot relay`);
      return;
    }

    // Forward with device token so desktop can validate
    this.send(desktop.socket, {
      type: 'relay',
      payload: {
        from: 'mobile',
        deviceToken,
        data: payload,
      },
    } as RelayMessage);
  }

  private relayToMobiles(desktopId: string, payload: unknown): void {
    const mobileClients = this.mobiles.get(desktopId);
    if (!mobileClients) {
      return;
    }

    for (const mobile of mobileClients) {
      if (mobile.socket.readyState === WebSocket.OPEN) {
        this.send(mobile.socket, {
          type: 'relay',
          payload: {
            from: 'desktop',
            data: payload,
          },
        } as RelayMessage);
      }
    }
  }

  private handleDisconnect(socket: WebSocket): void {
    // Check if desktop
    const desktopId = this.socketToDesktop.get(socket);
    if (desktopId) {
      console.log(`[Relay] Desktop ${desktopId} disconnected`);
      this.desktops.delete(desktopId);
      this.socketToDesktop.delete(socket);

      // Notify all mobile clients
      const mobileClients = this.mobiles.get(desktopId);
      if (mobileClients) {
        for (const mobile of mobileClients) {
          if (mobile.socket.readyState === WebSocket.OPEN) {
            this.send(mobile.socket, { type: 'desktop:disconnected' });
          }
        }
      }
      return;
    }

    // Check if mobile
    const mobileInfo = this.socketToMobile.get(socket);
    if (mobileInfo) {
      console.log(`[Relay] Mobile disconnected for desktop ${mobileInfo.desktopId}`);
      this.socketToMobile.delete(socket);

      // Remove from mobile set
      const mobileSet = this.mobiles.get(mobileInfo.desktopId);
      if (mobileSet) {
        for (const client of mobileSet) {
          if (client.socket === socket) {
            mobileSet.delete(client);
            break;
          }
        }
        if (mobileSet.size === 0) {
          this.mobiles.delete(mobileInfo.desktopId);
        }
      }

      // Notify desktop
      const desktop = this.desktops.get(mobileInfo.desktopId);
      if (desktop && desktop.socket.readyState === WebSocket.OPEN) {
        this.send(desktop.socket, {
          type: 'mobile:disconnected',
          deviceToken: mobileInfo.deviceToken,
        });
      }
    }
  }

  private cleanupStaleConnections(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes without activity

    // Clean up stale desktops (connections that are no longer actually open)
    for (const [desktopId, client] of this.desktops) {
      if (client.socket.readyState !== WebSocket.OPEN) {
        console.log(`[Relay] Cleaning up stale desktop ${desktopId}`);
        this.desktops.delete(desktopId);
        this.socketToDesktop.delete(client.socket);
      }
    }

    // Clean up stale mobiles
    for (const [desktopId, mobileSet] of this.mobiles) {
      for (const client of mobileSet) {
        if (client.socket.readyState !== WebSocket.OPEN) {
          console.log(`[Relay] Cleaning up stale mobile for ${desktopId}`);
          mobileSet.delete(client);
          this.socketToMobile.delete(client.socket);
        }
      }
      if (mobileSet.size === 0) {
        this.mobiles.delete(desktopId);
      }
    }
  }

  private send(socket: WebSocket, message: OutgoingMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private sendError(socket: WebSocket, error: string): void {
    this.send(socket, { type: 'error', error });
  }

  getStats(): { desktops: number; mobiles: number } {
    let mobileCount = 0;
    for (const set of this.mobiles.values()) {
      mobileCount += set.size;
    }
    return {
      desktops: this.desktops.size,
      mobiles: mobileCount,
    };
  }

  close(): void {
    this.wss.close();
  }
}
