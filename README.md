# PeerSpace

Study rooms with authentication, chat, shared timers, host controls, camera/microphone calls and approved screen sharing.

## Docker: one container

Requires Docker Desktop (Linux containers), MongoDB Atlas and TURN credentials.
From the repository root, copy Backend/.env.example to Backend/.env if you do not already have an .env. Fill in your credentials. Existing users should keep their existing .env.

Generate a JWT secret with Node:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Start or rebuild after changing code:

```sh
docker compose up --build
```

Open http://localhost:3000. Express serves the built React app, API and Socket.IO. No separate Vite process is needed. MongoDB and TURN stay external; no database runs inside this container.

Useful commands:

```sh
docker compose up -d --build
docker compose ps
docker compose logs -f
docker compose down
```

The health check calls /health every 30 seconds: 200 when MongoDB is connected, otherwise 503. Docker reports unhealthy after repeated failures; this does not automatically restart the container. Shutdown disconnects sockets, drains HTTP requests and closes MongoDB, with an 8-second deadline.

Compose fixes the internal port at 3000. For a different local port, change the left side of ports (for example 8080:3000) and CLIENT_ORIGIN accordingly. Stop any old standalone container using the same port first.

## Environment

- MONGO_URI: MongoDB connection string; Atlas must allow your server's network access.
- JWT_SECRET: long random signing secret.
- CLIENT_ORIGIN: exact website origin, without a trailing slash. Docker local: http://localhost:3000. Vite local: http://localhost:5173. Hosted: your HTTPS origin.
- PORT: listening port; defaults to 3000. Compose overrides this to match its mapping.
- TURN_URL, TURN_USERNAME, TURN_PASSWORD: provider credentials required for call configuration. Keep its URL and transport unchanged.
- NODE_ENV: production enables static frontend serving and secure cookies. Compose sets this automatically.

Secrets are passed at runtime, excluded from Git and Docker's build context. Do not paste secrets into the Dockerfile or frontend code.

## Local development without Docker

Run npm ci then npm run dev in Backend and Frontend in separate terminals. Backend reads Backend/.env. Set CLIENT_ORIGIN=http://localhost:5173 and leave NODE_ENV unset. Vite proxies API and socket requests to port 3000.

## Checks

```sh
npm --prefix Backend test
npm --prefix Frontend run lint
npm --prefix Frontend run build
npm --prefix Frontend run test:screen
npm --prefix Frontend run test:chat
```

Browser tests require Chrome. The optional backend chat integration test requires an isolated CHAT_TEST_MONGO_URI, never a production database.

## Hosting and scaling

Deploy one instance of this Docker image behind HTTPS, passing the environment settings at runtime and routing WebSocket upgrades to the same server. Camera and microphone require HTTPS outside localhost. Production cookies are Secure; local testing uses localhost. Set the hosting health path to /health and provide at least 10 seconds for graceful shutdown.

No hosting account or paid resource is created by this setup. A strictly free provider and its current limits still need to be selected and verified.

Presence and screen-share approvals currently live in process memory. Before adding backend instances, introduce shared state and a Socket.IO adapter, plus appropriate session affinity if polling remains enabled. Larger video meetings require an SFU; backend replicas alone do not scale the current peer-to-peer media mesh. TURN quotas and browser autoplay restrictions still apply.

## Production checks

Registration requires passwords of at least 8 characters and at most 72 UTF-8 bytes (bcrypt's input limit), usernames up to 50 characters and emails up to 254 characters. Room names are limited to 100 characters. Existing passwords below 8 characters still work at login.

Authentication endpoints are limited by client IP: 10 registrations and 30 login requests per 15 minutes. Room creation allows 10 requests per minute per user, joining 30. Sockets allow 120 non-ICE events and 600 ICE events per user per minute. Limits are in memory and reset on restart; use shared storage before deploying multiple replicas. HTTP rejections return 429 with Retry-After.

API writes and browser WebSocket handshakes require CLIENT_ORIGIN to match the website origin. Postman/server clients without an Origin header must still authenticate. JSON bodies are limited to 32 KB, socket messages to 128 KB. Cookies and private API responses are not cached. Socket sessions disconnect at token expiry; logout disconnects sockets sharing that login token.

Behind a hosting proxy, configure TRUST_PROXY only after verifying the provider's exact proxy topology (hop count or trusted addresses). Do not blindly trust all forwarded headers: incorrect settings can let users bypass IP limits. Leave it unset for local Docker. Verify this configuration and HTTPS cookies on the selected hosting service before release.

Before publishing, manually verify with two real users on different networks: login/logout, room creation/joining, camera-off audio, TURN connectivity, host-approved screen sharing and reconnect after network loss. Automated tests use synthetic media and cannot verify a provider's live TURN quota or a user's device permissions.
