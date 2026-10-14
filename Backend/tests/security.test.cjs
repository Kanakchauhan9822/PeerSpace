const { test } = require('node:test')
const assert = require('node:assert/strict')
const jwt = require('jsonwebtoken')
const app = require('../src/app')
const { createWindowLimit } = require('../src/middlewares/requestLimits')

test('HTTP rejects malformed input, forged origins and invalid sessions without database access', async t => {
    process.env.JWT_SECRET = 'isolated-security-test'
    const server = app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    t.after(() => new Promise(resolve => server.close(resolve)))
    const base = 'http://127.0.0.1:' + server.address().port
    const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body })
    assert.equal((await post('/api/auth/register', '{')).status, 400)
    assert.equal((await post('/api/auth/register', JSON.stringify({ username: 'a', email: 'a@b.com', password: 'short' }))).status, 400)
    assert.equal((await post('/api/auth/register', JSON.stringify({ username: 'a', email: 'a@b.com', password: 'a'.repeat(73) }))).status, 400)
    assert.equal((await post('/api/auth/register', JSON.stringify({ username: { $ne: null }, email: 'a@b.com', password: 'long-password' }))).status, 400)
    assert.equal((await post('/api/auth/login', JSON.stringify({ email: 'a'.repeat(40000) }))).status, 413)
    assert.equal((await post('/api/auth/logout', '{}', { Origin: 'https://untrusted.example' })).status, 403)
    for (const token of [jwt.sign({ id: { $ne: null } }, process.env.JWT_SECRET), jwt.sign({ id: '507f1f77bcf86cd799439011' }, process.env.JWT_SECRET, { expiresIn: -1 }), jwt.sign({ id: '507f1f77bcf86cd799439011' }, process.env.JWT_SECRET, { algorithm: 'HS384' })]) {
        assert.equal((await fetch(base + '/api/auth/get-me', { headers: { Cookie: 'token=' + token } })).status, 401)
    }
    let response
    for (let i = 0; i < 31; i++) response = await post('/api/auth/login', '{}', { 'X-Forwarded-For': '192.0.2.' + i })
    assert.equal(response.status, 429)
    assert.ok(Number(response.headers.get('retry-after')) > 0)
    assert.equal(response.headers.get('x-powered-by'), null)
    assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('request limit separates identities and bounds storage', () => {
    const limit = createWindowLimit(2, 60000, 2)
    assert.equal(limit('a'), 0)
    assert.equal(limit('a'), 0)
    assert.ok(limit('a') > 0)
    assert.equal(limit('b'), 0)
    assert.ok(limit('c') > 0)
})

test('socket events are rate limited and expired sessions disconnect', async t => {
    const { registerRoomEvents } = require('../src/sockets/room.socket')
    const handlers = new Map()
    let middleware
    let disconnected = false
    const socket = { id: 'test', data: { userId: 'user', expiresAt: Date.now() + 50 }, rooms: new Set(),
        on: (event, handler) => handlers.set(event, handler), use: handler => { middleware = handler },
        disconnect: () => { disconnected = true } }
    const io = { on: (event, handler) => handler(socket), sockets: { sockets: new Map() }, to: () => ({ emit() {} }) }
    registerRoomEvents(io)
    t.after(() => handlers.get('disconnect')?.())
    let accepted = 0
    let rejected = 0
    for (let i = 0; i < 121; i++) middleware(['screen:request', {}, result => { if (!result.success) rejected++ }], () => { accepted++ })
    assert.equal(accepted, 120)
    assert.equal(rejected, 1)
    await new Promise(resolve => setTimeout(resolve, 80))
    assert.equal(disconnected, true)
})
