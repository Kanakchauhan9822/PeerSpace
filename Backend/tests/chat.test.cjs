const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const Room = require('../src/models/room.model')
const User = require('../src/models/user.model')
const Message = require('../src/models/message.model')
const app = require('../src/app')

test('chat HTTP routes enforce access, validation, pagination and retry safety', async t => {
    const originals = { room: Room.findById, user: User.findById, find: Message.find,
        one: Message.findOne, upsert: Message.findOneAndUpdate }
    const secret = process.env.JWT_SECRET
    process.env.JWT_SECRET = 'isolated-chat-test-secret'
    const roomId = new mongoose.Types.ObjectId().toString()
    const memberId = new mongoose.Types.ObjectId().toString()
    const outsiderId = new mongoose.Types.ObjectId().toString()
    const rateUserId = new mongoose.Types.ObjectId().toString()
    let members = [memberId, rateUserId], roomExists = true, sequence = 0
    const rows = [], broadcasts = []
    let revokeDuringQuery = false
    Room.findById = () => ({ select: () => ({ lean: async () => roomExists
        ? { members: members.map(user => ({ user })) } : null }) })
    User.findById = () => ({ select: () => ({ lean: async () => ({ username: 'Actual sender' }) }) })
    const matches = (row, key) => Object.entries(key).every(([field, value]) => String(row[field]) === String(value))
    Message.findOne = key => ({ lean: async () => rows.find(row => matches(row, key)) || null })
    Message.findOneAndUpdate = (key, update) => ({ lean: async () => {
        let row = rows.find(row => matches(row, key))
        if (!row) {
            row = { ...update.$setOnInsert, _id: (++sequence).toString(16).padStart(24, '0'), createdAt: new Date() }
            rows.push(row)
        }
        return row
    } })
    Message.find = filter => ({ sort: () => ({ limit: limit => ({ lean: async () => {
        if (revokeDuringQuery) members = []
        return rows.filter(row => row.room === filter.room && (!filter._id || row._id < filter._id.$lt))
            .sort((a, b) => b._id.localeCompare(a._id)).slice(0, limit)
    } }) }) })
    app.set('io', { to: channel => ({ emit: (event, message) => broadcasts.push({ channel, event, message }) }) })
    const server = http.createServer(app)
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    t.after(async () => {
        await new Promise(resolve => server.close(resolve))
        Room.findById = originals.room
        User.findById = originals.user
        Message.find = originals.find
        Message.findOne = originals.one
        Message.findOneAndUpdate = originals.upsert
        if (secret === undefined) delete process.env.JWT_SECRET
        else process.env.JWT_SECRET = secret
    })
    const base = `http://127.0.0.1:${server.address().port}/api/rooms`
    async function request({ user = memberId, method = 'GET', body, suffix = '', room = roomId } = {}) {
        const headers = { 'Content-Type': 'application/json' }
        if (user) headers.Cookie = `token=${jwt.sign({ id: user }, process.env.JWT_SECRET)}`
        const response = await fetch(`${base}/${room}/messages${suffix}`, {
            method, headers, body: body ? JSON.stringify(body) : undefined
        })
        return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') }
    }
    const payload = text => ({ text, clientMessageId: crypto.randomUUID() })

    await t.test('authentication and membership apply to reads and writes', async () => {
        assert.equal((await request({ user: null })).status, 401)
        assert.equal((await request({ user: outsiderId })).status, 403)
        assert.equal((await request({ user: outsiderId, method: 'POST', body: payload('No') })).status, 403)
        assert.equal((await request({ room: 'invalid' })).status, 400)
        assert.equal((await request({ suffix: '?before=invalid' })).status, 400)
        roomExists = false
        assert.equal((await request()).status, 404)
        roomExists = true
        assert.equal(rows.length, 0)
    })
    await t.test('invalid input is rejected and sender identity comes from authentication', async () => {
        for (const text of ['', '   ', 'x'.repeat(2001), { $gt: '' }]) {
            assert.equal((await request({ method: 'POST', body: payload(text) })).status, 400)
        }
        assert.equal((await request({ method: 'POST', body: { text: 'hello', clientMessageId: 'bad' } })).status, 400)
        const result = await request({ method: 'POST', body: { ...payload('  Hello\nroom  '), sender: outsiderId, senderName: 'Forged' } })
        assert.equal(result.status, 200)
        assert.equal(result.body.message.sender._id, memberId)
        assert.equal(result.body.message.sender.username, 'Actual sender')
        assert.equal(result.body.message.text, 'Hello\nroom')
        assert.equal(result.cache, 'no-store')
        assert.equal(broadcasts.at(-1).channel, `room:${roomId}`)
        assert.equal(broadcasts.at(-1).event, 'chat:message')
    })
    await t.test('concurrent retries use one stored message and reject changed content', async () => {
        const body = payload('Retry me')
        const [a, b] = await Promise.all([request({ method: 'POST', body }), request({ method: 'POST', body })])
        assert.equal(a.body.message._id, b.body.message._id)
        assert.equal(rows.filter(row => row.clientMessageId === body.clientMessageId).length, 1)
        assert.equal((await request({ method: 'POST', body: { ...body, text: 'Changed' } })).status, 409)
        assert.ok(Message.schema.indexes().some(([fields, options]) => fields.clientMessageId === 1 && options.unique))
    })
    await t.test('history is bounded and pagination has no overlap', async () => {
        for (let i = 0; i < 60; i++) rows.push({ room: roomId, sender: memberId, senderName: 'Actual sender',
            text: `Seed ${i}`, clientMessageId: crypto.randomUUID(), _id: (++sequence).toString(16).padStart(24, '0'), createdAt: new Date() })
        const first = (await request()).body
        const second = (await request({ suffix: `?before=${first.nextCursor}` })).body
        assert.equal(first.messages.length, 50)
        assert.equal(second.nextCursor, null)
        assert.equal(new Set([...first.messages, ...second.messages].map(row => row._id)).size, rows.length)
        assert.ok(first.messages.every((row, i) => !i || row._id > first.messages[i - 1]._id))
        revokeDuringQuery = true
        assert.equal((await request()).status, 403)
        revokeDuringQuery = false
        members = [memberId, rateUserId]
    })
    await t.test('rapid sending is limited while retries remain allowed', async () => {
        let first
        for (let i = 0; i < 10; i++) {
            const body = payload(`Rate ${i}`)
            if (!first) first = body
            assert.equal((await request({ user: rateUserId, method: 'POST', body })).status, 200)
        }
        assert.equal((await request({ user: rateUserId, method: 'POST', body: payload('Too many') })).status, 429)
        assert.equal((await request({ user: rateUserId, method: 'POST', body: first })).status, 200)
    })
})
