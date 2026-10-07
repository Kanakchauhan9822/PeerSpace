const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const mongoose = require('mongoose')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const { Server } = require('socket.io')
const { io: client } = require('../../Frontend/node_modules/socket.io-client')
const app = require('../src/app')
const Room = require('../src/models/room.model')
const User = require('../src/models/user.model')
const Message = require('../src/models/message.model')
const { socketAuth } = require('../src/middlewares/socketAuth.middleware')
const { registerRoomEvents } = require('../src/sockets/room.socket')

test('real MongoDB persistence and two authenticated socket recipients', {
    skip: !process.env.CHAT_TEST_MONGO_URI,
    timeout: 30000
}, async t => {
    // The runner supplies a disposable database, never the application's .env.
    await mongoose.connect(process.env.CHAT_TEST_MONGO_URI)
    process.env.JWT_SECRET = 'chat-isolated-integration-secret'
    const server = http.createServer(app)
    const io = new Server(server)
    app.set('io', io)
    io.engine.use(cookieParser())
    io.use(socketAuth)
    registerRoomEvents(io)
    const clients = []
    t.after(async () => {
        clients.forEach(socket => socket.disconnect())
        await new Promise(resolve => io.close(resolve))
        await mongoose.disconnect()
    })
    await Promise.all([Room.init(), User.init(), Message.init()])
    const [a, b] = await User.create([
        { username: 'chat-test-a', email: 'chat-a@example.test', password: 'unused-test-hash' },
        { username: 'chat-test-b', email: 'chat-b@example.test', password: 'unused-test-hash' }
    ])
    const room = await Room.create({ name: 'Integration room', host: a._id, members: [{ user: a._id }, { user: b._id }] })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const cookie = user => `token=${jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET)}`
    async function connect(user) {
        const socket = client(origin, { transports: ['websocket'], extraHeaders: { Cookie: cookie(user) } })
        clients.push(socket)
        await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject) })
        const result = await socket.timeout(3000).emitWithAck('room:subscribe', { roomId: room.id })
        assert.equal(result.success, true)
        return socket
    }
    const [sa, sb] = await Promise.all([connect(a), connect(b)])
    async function request(user, path, body) {
        const response = await fetch(`${origin}/api/rooms/${path}`, {
            method: body ? 'POST' : 'GET', headers: { Cookie: cookie(user), 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined
        })
        return { status: response.status, body: await response.json() }
    }
    const receive = socket => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Live message not received')), 4000)
        socket.once('chat:message', data => { clearTimeout(timer); resolve(data) })
    })
    const receivedA = receive(sa), receivedB = receive(sb)
    const payload = { text: 'Real persistence and live delivery', clientMessageId: crypto.randomUUID() }
    const sent = await request(a, `${room.id}/messages`, payload)
    assert.equal(sent.status, 200)
    const deliveries = await Promise.all([receivedA, receivedB])
    assert.ok(deliveries.every(message => message._id === sent.body.message._id))
    assert.equal(await Message.countDocuments({ room: room._id }), 1)

    const duplicate = { text: 'Concurrent retry', clientMessageId: crypto.randomUUID() }
    const retries = await Promise.all([request(a, `${room.id}/messages`, duplicate), request(a, `${room.id}/messages`, duplicate)])
    assert.ok(retries.every(result => result.status === 200))
    assert.equal(retries[0].body.message._id, retries[1].body.message._id)
    assert.equal(await Message.countDocuments({ room: room._id, clientMessageId: duplicate.clientMessageId }), 1)

    await Message.insertMany(Array.from({ length: 55 }, (_, i) => ({ room: room._id, sender: a._id,
        senderName: a.username, text: `Older ${i}`, clientMessageId: crypto.randomUUID() })))
    const page = (await request(b, `${room.id}/messages`)).body
    assert.equal(page.messages.length, 50)
    const older = (await request(b, `${room.id}/messages?before=${page.nextCursor}`)).body
    assert.equal(new Set([...page.messages, ...older.messages].map(message => message._id)).size, 57)

    assert.equal((await request(b, `${room.id}/leave`, {})).status, 200)
    assert.equal((await request(b, `${room.id}/messages`)).status, 403)
    assert.equal((await request(b, `${room.id}/messages`, { text: 'Forbidden', clientMessageId: crypto.randomUUID() })).status, 403)
    let leaked = false
    sb.on('chat:message', () => { leaked = true })
    await request(a, `${room.id}/messages`, { text: 'After member left', clientMessageId: crypto.randomUUID() })
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(leaked, false)
    assert.equal((await request(a, `${room.id}/end`, {})).status, 200)
    assert.equal(await Message.countDocuments({ room: room._id }), 0)
    assert.equal((await request(a, `${room.id}/messages`)).status, 404)

    const solo = await Room.create({ name: 'Solo room', host: a._id, members: [{ user: a._id }] })
    await request(a, `${solo.id}/messages`, { text: 'Delete with empty room', clientMessageId: crypto.randomUUID() })
    assert.equal((await request(a, `${solo.id}/leave`, {})).status, 200)
    assert.equal(await Message.countDocuments({ room: solo._id }), 0)
})
