# ClaudeLander Relay Server

Relay server for ClaudeLander session sharing. Enables E2E encrypted live session collaboration.

## Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your values

# Start PostgreSQL (or use docker-compose)
docker-compose up postgres -d

# Run in development
npm run start:dev
```

## Deployment

```bash
# On your VPS
git clone https://github.com/William-Long-II/claudelander-relay.git
cd claudelander-relay
cp .env.example .env
# Edit .env with production values

# Deploy
docker-compose up -d --build
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/auth/github` | Start OAuth flow |
| GET | `/auth/github/callback` | OAuth callback |
| GET | `/auth/me` | Get current user |
| POST | `/sessions` | Start sharing |
| GET | `/sessions` | Get active sessions |
| DELETE | `/sessions/:id` | Stop sharing |
| POST | `/sessions/:id/codes` | Generate share code |
| GET | `/sessions/:id/codes` | List session codes |
| GET | `/codes/:code/validate` | Validate code |
| DELETE | `/codes/:code` | Revoke code |
| POST | `/billing/checkout` | Create checkout session |
| GET | `/billing/portal` | Create portal session |
| POST | `/billing/webhook` | Stripe webhook |
| WS | `/relay` | WebSocket relay |

## WebSocket Events

### Client -> Server
- `joinAsHost` - Host joins session
- `joinAsGuest` - Guest joins with code
- `relay` - Send encrypted data
- `keyExchange` - Exchange encryption keys

### Server -> Client
- `guestJoined` - New guest connected
- `peerDisconnected` - Peer left
- `relayData` - Incoming encrypted data
- `keyExchange` - Incoming key exchange

## License

MIT
