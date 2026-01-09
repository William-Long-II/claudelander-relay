# ClaudeLander Relay Server

Minimal WebSocket relay for ClaudeLander mobile companion app.

## Overview

Routes messages between desktop and mobile clients:
- Desktop connects with `desktopId`
- Mobile connects with `desktopId` + `deviceToken`
- Relay forwards messages; desktop validates tokens

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run
npm run dev
```

## Deployment

```bash
# On VPS (Ubuntu 24.04)
git clone https://github.com/William-Long-II/claudelander-relay.git
cd claudelander-relay

# Build locally first
npm install
npm run build

# Deploy with Docker
docker compose up -d --build
```

**DNS:** Add A record for `cl-relay.sytanek.tech` pointing to your VPS IP.

Caddy will automatically obtain and renew SSL certificates.

## Endpoints

- `wss://cl-relay.sytanek.tech` - WebSocket relay
- `https://cl-relay.sytanek.tech/health` - Health check

## Protocol

### Desktop Connection
```json
{ "type": "desktop:connect", "desktopId": "uuid" }
```

### Mobile Connection
```json
{ "type": "mobile:connect", "desktopId": "uuid", "deviceToken": "token" }
```

### Relay Message
```json
{ "type": "relay", "payload": { ... } }
```

### Notifications
- `desktop:connected` - Sent to mobile when desktop connects
- `desktop:disconnected` - Sent to mobile when desktop disconnects
- `mobile:connected` - Sent to desktop when mobile connects
- `mobile:disconnected` - Sent to desktop when mobile disconnects

## License

MIT
