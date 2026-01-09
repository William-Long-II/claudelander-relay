/**
 * Message types for relay communication
 */

// Desktop connects to relay
export interface DesktopConnectMessage {
  type: 'desktop:connect';
  desktopId: string;
}

// Mobile connects to relay
export interface MobileConnectMessage {
  type: 'mobile:connect';
  desktopId: string;
  deviceToken: string;
}

// Forward message to other party
export interface RelayMessage {
  type: 'relay';
  payload: unknown;
}

// Disconnect notification
export interface DisconnectMessage {
  type: 'disconnect';
  reason?: string;
}

// Error message
export interface ErrorMessage {
  type: 'error';
  error: string;
}

// Mobile connected notification (sent to desktop)
export interface MobileConnectedMessage {
  type: 'mobile:connected';
  deviceToken: string;
}

// Mobile disconnected notification (sent to desktop)
export interface MobileDisconnectedMessage {
  type: 'mobile:disconnected';
  deviceToken: string;
}

// Desktop connected notification (sent to mobile)
export interface DesktopConnectedMessage {
  type: 'desktop:connected';
}

// Desktop disconnected notification (sent to mobile)
export interface DesktopDisconnectedMessage {
  type: 'desktop:disconnected';
}

// Ping/pong for keepalive
export interface PingMessage {
  type: 'ping';
}

export interface PongMessage {
  type: 'pong';
}

// Union type for all incoming messages
export type IncomingMessage =
  | DesktopConnectMessage
  | MobileConnectMessage
  | RelayMessage
  | PingMessage;

// Union type for all outgoing messages
export type OutgoingMessage =
  | RelayMessage
  | ErrorMessage
  | MobileConnectedMessage
  | MobileDisconnectedMessage
  | DesktopConnectedMessage
  | DesktopDisconnectedMessage
  | PongMessage;
