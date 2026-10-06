const { test } = require('node:test')
const assert = require('node:assert/strict')
const roomModel = require('../src/models/room.model')
const { registerRoomEvents } = require('../src/sockets/room.socket')

test('screen metadata is validated, authorized, broadcast and ordered', async t => {
    const originalFind = roomModel.findOne
    let lookup = async () => ({ _id: '507f1f77bcf86cd799439011' })
    roomModel.findOne = () => ({ select: () => ({ lean: () => lookup() }) })
    t.after(() => { roomModel.findOne = originalFind })
    const roomId = '507f1f77bcf86cd799439011'
    const channel = `room:${roomId}`
    const handlers = new Map(), broadcasts = []
    const socket = {
        id: 'socket-a', connected: true,
        data: { userId: 'user-a' }, rooms: new Set([channel]),
        on: (name, handler) => handlers.set(name, handler)
    }
    const io = {
        sockets: { sockets: new Map([[socket.id, socket]]) },
        on: (name, handler) => { if (name === 'connection') handler(socket) },
        to: () => ({ emit: (name, payload) => broadcasts.push({ name, payload }) })
    }
    registerRoomEvents(io)
    const call = (name, payload) => new Promise(resolve => handlers.get(name)(payload, resolve))

    assert.equal((await call('webrtc:ready', { roomId, cameraEnabled: true, screenSharing: true })).success, false)
    assert.equal((await call('webrtc:ready', { roomId, cameraEnabled: false, screenSharing: true })).success, true)
    assert.equal(broadcasts.at(-1).payload.peers[0].screenSharing, true)

    assert.equal((await call('webrtc:camera-state', { roomId, cameraEnabled: false, screenSharing: 'yes' })).success, false)
    assert.equal((await call('webrtc:camera-state', { roomId, cameraEnabled: true, screenSharing: true })).success, false)

    lookup = async () => null
    assert.equal((await call('webrtc:camera-state', { roomId, cameraEnabled: true, screenSharing: false })).success, false)
    assert.equal(socket.data.screenSharing, true)

    const pending = []
    lookup = () => new Promise(resolve => pending.push(resolve))
    const older = call('webrtc:camera-state', { roomId, cameraEnabled: false, screenSharing: true })
    const newer = call('webrtc:camera-state', { roomId, cameraEnabled: true, screenSharing: false })
    pending[1]({ _id: roomId })
    assert.equal((await newer).success, true)
    pending[0]({ _id: roomId })
    await older
    assert.equal(socket.data.cameraEnabled, true)
    assert.equal(socket.data.screenSharing, false)
    assert.equal(broadcasts.at(-1).payload.peers[0].screenSharing, false)

    socket.rooms.clear()
    assert.equal((await call('webrtc:camera-state', { roomId, cameraEnabled: false, screenSharing: true })).success, false)
})
