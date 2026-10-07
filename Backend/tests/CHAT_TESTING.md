# Room chat

Run `npm test` in Backend for HTTP authorization, input validation, bounded
history, idempotent sends and rate limiting. These tests use an isolated model
store and do not load .env or connect to the application's database.

For real MongoDB and Socket.IO integration, set `CHAT_TEST_MONGO_URI` to an
**empty disposable test database**, install the frontend dependencies too, and
run `npm run test:chat:integration` in Backend. It inserts fixture users and
rooms into that database. Never point this variable at your application DB.
The test skips when the variable is absent.

Run `npm run test:chat` in Frontend for the Chrome UI tests. The runner uses
synthetic API responses and socket events. Chrome defaults to its standard
Windows installation; set `CHROME_PATH` for another executable location.
`npm run test:screen` checks the existing screen-sharing regression suite.

## Behavior

- GET `/api/rooms/:roomId/messages`: authenticated members, newest 50 messages
  returned oldest-first, `nextCursor` for older history. Pass `?before=<cursor>`.
- POST the same URL with `{text, clientMessageId}`. Text is trimmed, limited to
  2000 characters. `clientMessageId` is a UUID retained on retries. Sender ID and
  name come from the authenticated user, not the payload.
- A unique room/sender/request index prevents duplicate saved messages.
  Server startup waits for indexes before accepting requests.
- Socket event `chat:message` contains the saved message and is emitted only
  to the room channel. Clients deduplicate response and event by message ID.
- Sending is limited to 10 new messages per user per 10 seconds per backend
  process. This in-memory limit resets on restart; distributed deployments
  need a shared limiter.
- Reconnect refreshes recent history. Older history can be loaded manually.
  Drafts survive network loss; they do not survive a full page reload.
- Ending a room or the last member leaving deletes its messages. Cleanup
  failures are logged; deleted rooms remain inaccessible through chat routes.

Manual check: two accounts in one room, live delivery in both browsers,
refresh history, disconnect/reconnect, multiline text, and leaving the room.
