const { test } = require('node:test')
const assert = require('node:assert/strict')
const Room = require('../src/models/room.model')
const { registerScreenPermissions } = require('../src/sockets/screenPermissions')

test('screen approval is host-only, single-use, expiring and bound to room membership', async t => {
    const roomId = '507f1f77bcf86cd799439011'
    const channel = 'room:' + roomId
    const room = { host: 'host', members: [{ user: 'host' }, { user: 'member' }, { user: 'other' }] }
    const original = Room.findOne
    Room.findOne = query => ({ select: () => ({ lean: async () => room.members.some(item => item.user === query['members.user']) ? room : null }) })
    t.after(() => { Room.findOne = original })
    const sockets = new Map()
    const io = { sockets: { sockets } }
    function client(id) {
        const handlers = new Map()
        const events = []
        const socket = { id, connected: true, rooms: new Set([channel]), data: { userId: id, mediaRoom: channel },
            on: (event, fn) => handlers.set(event, fn), emit: (event, data) => events.push({ event, data }) }
        sockets.set(id, socket)
        registerScreenPermissions(io, socket, () => {})
        return { socket, events, call: (event, data = {}) => new Promise(resolve => handlers.get(event)({ roomId, ...data }, resolve)) }
    }
    const host = client('host'), member = client('member'), other = client('other')
    assert.equal((await member.call('screen:start')).success, false)
    assert.equal((await member.call('screen:request')).success, true)
    const requestId = member.socket.data.screenRequest.requestId
    assert.equal(host.events.at(-1).data.requests.length, 1)
    assert.equal((await other.call('screen:decide', { requestId, allowed: true })).success, false)
    assert.equal((await host.call('screen:decide', { requestId, allowed: false })).success, true)
    assert.equal((await member.call('screen:start')).success, false)
    async function approve() {
        await member.call('screen:request')
        await host.call('screen:decide', { requestId: member.socket.data.screenRequest.requestId, allowed: true })
    }
    await approve()
    assert.equal((await member.call('screen:start')).success, true)
    assert.equal(member.socket.data.screenActive, channel)
    await member.call('screen:stop')
    assert.equal((await member.call('screen:start')).success, false)
    await approve()
    member.socket.data.screenGrant.expiresAt = 1
    assert.equal((await member.call('screen:start')).success, false)
    await approve()
    room.host = 'other'
    assert.equal((await member.call('screen:start')).success, false)
    room.host = 'host'
    await approve()
    member.socket.rooms.clear()
    assert.equal((await member.call('screen:start')).success, false)
    assert.equal((await host.call('screen:start')).success, true)
})
