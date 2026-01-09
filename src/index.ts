/**
 * ClaudeLander Relay Server
 *
 * Minimal WebSocket relay for mobile companion app.
 * Routes messages between desktop and mobile clients.
 */

import { RelayServer } from './relay-server';

const PORT = parseInt(process.env.PORT || '3000', 10);

console.log('[Relay] Starting ClaudeLander Relay Server...');

const server = new RelayServer(PORT);

// Health check endpoint using basic HTTP
import { createServer } from 'http';

const healthServer = createServer((req, res) => {
  if (req.url === '/health') {
    const stats = server.getStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      timestamp: Date.now(),
      stats,
    }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || '3001', 10);
healthServer.listen(HEALTH_PORT, () => {
  console.log(`[Relay] Health check endpoint on port ${HEALTH_PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Relay] Received SIGTERM, shutting down...');
  server.close();
  healthServer.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Relay] Received SIGINT, shutting down...');
  server.close();
  healthServer.close();
  process.exit(0);
});

// Log stats periodically
setInterval(() => {
  const stats = server.getStats();
  console.log(`[Relay] Stats: ${stats.desktops} desktop(s), ${stats.mobiles} mobile(s)`);
}, 60000);
