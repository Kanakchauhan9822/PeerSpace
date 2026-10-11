const mongoose = require('mongoose')
const { randomUUID } = require('node:crypto')
const Room = require('../models/room.model')

function registerScreenPermissions(io, socket, broadcast) {
    async function roomFor(roomId, requireMedia = false) {
        if (!mongoose.isObjectIdOrHexString(roomId)) throw new Error('Invalid room')
        const channel = 'room:' + roomId.toLowerCase()
        const room = await Room.findOne({ _id: roomId, 'members.user': socket.data.userId }).select('host members.user').lean()
        if (!room || !socket.connected || !socket.rooms.has(channel) || (requireMedia && socket.data.mediaRoom !== channel)) throw new Error('Join the call first')
        return { room, channel, roomId: roomId.toLowerCase() }
    }
    function publish(roomId, hostId) {
        const requests = [...io.sockets.sockets.values()].filter(peer => peer.connected && peer.rooms.has('room:' + roomId) && peer.data.screenRequest?.roomId === roomId && peer.data.screenRequest.expiresAt > Date.now()).map(peer => peer.data.screenRequest)
        for (const peer of io.sockets.sockets.values()) {
            if (String(peer.data.userId) === String(hostId) && peer.rooms.has('room:' + roomId)) peer.emit('screen:requests', { roomId, requests })
        }
        return requests
    }
    function handler(event, action) {
        socket.on(event, async (data, ack) => {
            if (typeof ack !== 'function') return
            try { ack({ success: true, ...await action(data || {}) }) }
            catch (error) { ack({ success: false, message: error.message }) }
        })
    }
    handler('screen:list', async data => {
        const { room, roomId } = await roomFor(data.roomId)
        if (String(room.host) !== String(socket.data.userId)) throw new Error('Host only')
        return { roomId, requests: publish(roomId, room.host) }
    })
    handler('screen:request', async data => {
        const { room, roomId } = await roomFor(data.roomId)
        const expiresAt = Date.now() + 120000
        if (String(room.host) === String(socket.data.userId)) return { allowed: true, expiresAt }
        const online = [...io.sockets.sockets.values()].some(peer => peer.connected && peer.rooms.has('room:' + roomId) && String(peer.data.userId) === String(room.host))
        if (!online) throw new Error('The host is offline. Try again when they return.')
        socket.data.screenRequest = { requestId: randomUUID(), roomId, userId: socket.data.userId, hostId: String(room.host), expiresAt }
        publish(roomId, room.host)
        return { allowed: false }
    })
    handler('screen:decide', async data => {
        const { room, roomId } = await roomFor(data.roomId)
        if (String(room.host) !== String(socket.data.userId) || typeof data.allowed !== 'boolean') throw new Error('Host only')
        const target = [...io.sockets.sockets.values()].find(peer => peer.data.screenRequest?.requestId === data.requestId && peer.data.screenRequest.roomId === roomId)
        if (!target || !target.connected || !target.rooms.has('room:' + roomId) || target.data.screenRequest.expiresAt < Date.now() || !room.members.some(member => String(member.user) === String(target.data.userId))) throw new Error('This request has expired')
        delete target.data.screenRequest
        const expiresAt = Date.now() + 120000
        target.data.screenGrant = data.allowed ? { roomId, hostId: String(room.host), expiresAt } : null
        target.emit('screen:decision', { roomId, allowed: data.allowed, hostId: String(room.host), expiresAt })
        publish(roomId, room.host)
    })
    handler('screen:start', async data => {
        const { room, roomId, channel } = await roomFor(data.roomId, true)
        const grant = socket.data.screenGrant
        if (String(room.host) !== String(socket.data.userId) && !(grant?.roomId === roomId && grant.hostId === String(room.host) && grant.expiresAt > Date.now())) throw new Error('Ask the host for permission to share your screen')
        delete socket.data.screenGrant
        socket.data.screenActive = channel
        socket.data.screenSharing = true
        broadcast(channel)
    })
    handler('screen:stop', async data => {
        const { channel } = await roomFor(data.roomId)
        delete socket.data.screenActive
        delete socket.data.screenGrant
        socket.data.screenSharing = false
        broadcast(channel)
    })
    function clearPermission() {
        const request = socket.data.screenRequest
        delete socket.data.screenActive
        delete socket.data.screenGrant
        delete socket.data.screenRequest
        socket.data.screenSharing = false
        if (request) publish(request.roomId, request.hostId)
    }
    socket.on('webrtc:leave', clearPermission)
    socket.on('disconnect', clearPermission)
    socket.on('room:unsubscribe', data => {
        if (socket.data.screenRequest?.roomId === data?.roomId || socket.data.screenActive === 'room:' + data?.roomId) clearPermission()
    })
}
module.exports = { registerScreenPermissions }
