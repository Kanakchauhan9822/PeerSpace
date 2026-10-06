const mongoose = require('mongoose')
const roomModel = require('../models/room.model')

function registerRoomEvents(io) {
    async function broadcastPresence(roomChannel) {
        const sockets = await io.in(roomChannel).fetchSockets()

        const userIds = [
            ...new Set(sockets.map(socket => socket.data.userId))
        ]

        io.to(roomChannel).emit('room:presence', {
            roomId: roomChannel.slice('room:'.length),
            userIds
        })
    }

    async function validateSignalTarget(socket, payload) {
        const roomId = payload?.roomId
        const targetSocketId = payload?.targetSocketId

        if (
            typeof roomId !== 'string' ||
            !mongoose.isObjectIdOrHexString(roomId)
        ) {
            throw new Error('Invalid room ID')
        }

        if (
            typeof targetSocketId !== 'string' ||
            !targetSocketId ||
            targetSocketId === socket.id
        ) {
            throw new Error('Invalid target socket')
        }

        const normalizedRoomId = roomId.toLowerCase()
        const roomChannel = `room:${normalizedRoomId}`
        const targetSocket = io.sockets.sockets.get(targetSocketId)

        function bothSubscribed() {
            return (
                socket.connected &&
                targetSocket?.connected &&
                socket.rooms.has(roomChannel) &&
                targetSocket.rooms.has(roomChannel) &&
                socket.data.mediaRoom === roomChannel &&
                targetSocket.data.mediaRoom === roomChannel
            )
        }

        if (!bothSubscribed()) {
            throw new Error('Both participants must be connected to this room')
        }

        const room = await roomModel.findById(normalizedRoomId)
            .select('members.user')
            .lean()

        if (!room) {
            throw new Error('Room not found')
        }

        const memberIds = new Set(
            room.members.map(member => member.user.toString())
        )

        if (
            !memberIds.has(socket.data.userId) ||
            !memberIds.has(targetSocket.data.userId)
        ) {
            throw new Error('Both participants must be room members')
        }


        if (!bothSubscribed()) {
            throw new Error('Participant disconnected or left the room')
        }

        return {
            roomId: normalizedRoomId,
            targetSocket
        }
    }
    io.on('connection', (socket) => {
        socket.on('webrtc:offer', async (payload, acknowledge) => {
            if (typeof acknowledge !== 'function') return

            const description = payload?.description

            if (
                description?.type !== 'offer' ||
                typeof description.sdp !== 'string' ||
                !description.sdp.trim() ||
                description.sdp.length > 100000
            ) {
                return acknowledge({
                    success: false,
                    message: 'Invalid WebRTC offer'
                })
            }

            try {
                const { roomId, targetSocket } =
                    await validateSignalTarget(socket, payload)

                targetSocket.emit('webrtc:offer', {
                    roomId,
                    fromSocketId: socket.id,
                    fromUserId: socket.data.userId,
                    description: {
                        type: 'offer',
                        sdp: description.sdp
                    }
                })

                acknowledge({ success: true })
            } catch {
                acknowledge({
                    success: false,
                    message: 'Unable to forward offer. Check your room connection.'
                })
            }
        })

        socket.on('webrtc:answer', async (payload, acknowledge) => {
            if (typeof acknowledge !== 'function') return

            const description = payload?.description

            if (
                description?.type !== 'answer' ||
                typeof description.sdp !== 'string' ||
                !description.sdp.trim() ||
                description.sdp.length > 100000
            ) {
                return acknowledge({
                    success: false,
                    message: 'Invalid WebRTC answer'
                })
            }

            try {
                const { roomId, targetSocket } =
                    await validateSignalTarget(socket, payload)

                targetSocket.emit('webrtc:answer', {
                    roomId,
                    fromSocketId: socket.id,
                    fromUserId: socket.data.userId,
                    description: {
                        type: 'answer',
                        sdp: description.sdp
                    }
                })

                acknowledge({ success: true })
            } catch {
                acknowledge({
                    success: false,
                    message: 'Unable to forward answer. Check your room connection.'
                })
            }
        })

        socket.on('webrtc:ice-candidate', async (payload, acknowledge) => {
            if (typeof acknowledge !== 'function') return

            const candidate = payload?.candidate

            if (
                !candidate ||
                typeof candidate !== 'object' ||
                Array.isArray(candidate) ||
                typeof candidate.candidate !== 'string' ||
                candidate.candidate.length > 10000 ||
                (
                    candidate.sdpMid != null &&
                    (
                        typeof candidate.sdpMid !== 'string' ||
                        candidate.sdpMid.length > 256
                    )
                ) ||
                (
                    candidate.sdpMLineIndex != null &&
                    (
                        !Number.isInteger(candidate.sdpMLineIndex) ||
                        candidate.sdpMLineIndex < 0 ||
                        candidate.sdpMLineIndex > 65535
                    )
                ) ||
                (
                    candidate.sdpMid == null &&
                    candidate.sdpMLineIndex == null
                ) ||
                (
                    candidate.usernameFragment != null &&
                    (
                        typeof candidate.usernameFragment !== 'string' ||
                        candidate.usernameFragment.length > 256
                    )
                )
            ) {
                return acknowledge({
                    success: false,
                    message: 'Invalid ICE candidate'
                })
            }

            try {
                const { roomId, targetSocket } =
                    await validateSignalTarget(socket, payload)

                targetSocket.emit('webrtc:ice-candidate', {
                    roomId,
                    fromSocketId: socket.id,
                    fromUserId: socket.data.userId,
                    candidate: {
                        candidate: candidate.candidate,
                        sdpMid: candidate.sdpMid ?? null,
                        sdpMLineIndex: candidate.sdpMLineIndex ?? null,
                        usernameFragment: candidate.usernameFragment ?? null
                    }
                })

                acknowledge({ success: true })
            } catch {
                acknowledge({
                    success: false,
                    message: 'Unable to forward ICE candidate. Check your room connection.'
                })
            }
        })


        socket.on('room:subscribe', async (payload, acknowledge) => {
            if (typeof acknowledge !== 'function') return

            const roomId = payload?.roomId

            if (typeof roomId !== 'string' || !mongoose.isObjectIdOrHexString(roomId)) {
                return acknowledge({
                    success: false,
                    message: 'Invalid room Id'
                })
            }
            try {
                const room = await roomModel.findById(roomId)
                    .select('members.user')
                    .lean()
                if (!room) {
                    return acknowledge({
                        success: false,
                        message: 'Room not found'
                    })
                }
                const isMember = room.members.some(
                    member => member.user.toString() === socket.data.userId
                )

                if (!isMember) {
                    return acknowledge({
                        success: false,
                        message: 'Join this room before subscribing'
                    })
                }

                if (!socket.connected) return

                const roomChannel = `room:${room._id}`

                await socket.join(roomChannel)
                await broadcastPresence(roomChannel)

                acknowledge({
                    success: true,
                    roomId: room._id.toString()
                })
            } catch {
                acknowledge({
                    success: false,
                    message: 'Unable to subscribe to room'
                })
            }
        })

        let subscribedRooms = []

        socket.on('disconnecting', () => {
            subscribedRooms = [...socket.rooms].filter(
                roomChannel => roomChannel.startsWith('room:')
            )
        })

        socket.on('disconnect', () => {
            const mediaRoom = socket.data.mediaRoom
            delete socket.data.mediaRoom

            if (mediaRoom) {
                broadcastMediaPeers(mediaRoom)
            }

            for (const roomChannel of subscribedRooms) {
                broadcastPresence(roomChannel).catch(err => {
                    console.error('Unable to update room presence', err.message)
                })
            }
        })

        function broadcastMediaPeers(roomChannel) {
            const peers = []

            for (const socket of io.sockets.sockets.values()) {
                if (
                    socket.connected &&
                    socket.rooms.has(roomChannel) &&
                    socket.data.mediaRoom === roomChannel
                ) {
                    peers.push({
                        socketId: socket.id,
                        userId: socket.data.userId,
                        cameraEnabled: socket.data.cameraEnabled === true,
                        screenSharing: socket.data.screenSharing === true
                    })
                }
            }

            io.to(roomChannel).emit('webrtc:peers', {
                roomId: roomChannel.slice('room:'.length),
                peers
            })
        }

        socket.on('webrtc:ready', async (payload, acknowledge) => {
            if (typeof acknowledge !== 'function') return

            if (
                (payload?.screenSharing != null && typeof payload.screenSharing !== 'boolean') ||
                (payload?.cameraEnabled === true && payload?.screenSharing === true)
            ) {
                return acknowledge({ success: false, message: 'Invalid video state' })
            }

            const roomId = payload?.roomId

            if (
                typeof roomId !== 'string' ||
                !mongoose.isObjectIdOrHexString(roomId)
            ) {
                return acknowledge({
                    success: false,
                    message: 'Invalid room ID'
                })
            }

            const normalizedRoomId = roomId.toLowerCase()
            const roomChannel = `room:${normalizedRoomId}`

            if (!socket.rooms.has(roomChannel)) {
                return acknowledge({
                    success: false,
                    message: 'Subscribe to the room first'
                })
            }

            try {
                const room = await roomModel.findOne({
                    _id: normalizedRoomId,
                    'members.user': socket.data.userId
                }).select('_id').lean()

                if (!room) {
                    return acknowledge({
                        success: false,
                        message: 'Room unavailable or membership required'
                    })
                }

                if (!socket.connected || !socket.rooms.has(roomChannel)) {
                    return acknowledge({
                        success: false,
                        message: 'You are no longer connected to this room'
                    })
                }

                const previousRoom = socket.data.mediaRoom
                socket.data.mediaRoom = roomChannel
                socket.data.cameraEnabled = payload.cameraEnabled === true
                socket.data.screenSharing = payload.screenSharing === true

                if (previousRoom && previousRoom !== roomChannel) {
                    broadcastMediaPeers(previousRoom)
                }

                broadcastMediaPeers(roomChannel)

                acknowledge({
                    success: true,
                    roomId: normalizedRoomId
                })
            } catch {
                acknowledge({
                    success: false,
                    message: 'Unable to join the call'
                })
            }
        })

        socket.on('webrtc:leave', (acknowledge) => {
            if (typeof acknowledge !== 'function') return

            const roomChannel = socket.data.mediaRoom

            delete socket.data.mediaRoom

            if (roomChannel) {
                broadcastMediaPeers(roomChannel)
            }

            acknowledge({ success: true })
        })

        socket.on('room:unsubscribe', async (payload, acknowledge) => {
            if (typeof acknowledge !== 'function') return

            const roomId = payload?.roomId

            if (
                typeof roomId !== 'string' ||
                !mongoose.isObjectIdOrHexString(roomId)
            ) {
                return acknowledge({
                    success: false,
                    message: 'Invalid room ID'
                })
            }

            const roomChannel = `room:${roomId.toLowerCase()}`

            try {
                await socket.leave(roomChannel)

                if (socket.data.mediaRoom === roomChannel) {
                    delete socket.data.mediaRoom
                    broadcastMediaPeers(roomChannel)
                }
                await broadcastPresence(roomChannel)

                acknowledge({ success: true })
            } catch {
                acknowledge({
                    success: false,
                    message: 'Unable to unsubscribe from room'
                })
            }
        })

        socket.on('webrtc:camera-state', async (payload, acknowledge) => {
            if (typeof acknowledge !== 'function') return

            const roomId = payload?.roomId
            const cameraEnabled = payload?.cameraEnabled
            const screenSharing = payload?.screenSharing ?? false

            if (
                typeof roomId !== 'string' ||
                !mongoose.isObjectIdOrHexString(roomId) ||
                typeof cameraEnabled !== 'boolean' ||
                typeof screenSharing !== 'boolean' ||
                (cameraEnabled && screenSharing)
            ) {
                return acknowledge({
                    success: false,
                    message: 'Invalid camera state'
                })
            }

            const roomChannel = `room:${roomId.toLowerCase()}`

            function isInCall() {
                return (
                    socket.connected &&
                    socket.rooms.has(roomChannel) &&
                    socket.data.mediaRoom === roomChannel
                )
            }

            if (!isInCall()) {
                return acknowledge({
                    success: false,
                    message: 'Join the call first'
                })
            }

            const stateVersion = (socket.data.mediaStateVersion || 0) + 1
            socket.data.mediaStateVersion = stateVersion

            try {
                const room = await roomModel.findOne({
                    _id: roomId,
                    'members.user': socket.data.userId
                }).select('_id').lean()

                if (!room || !isInCall()) {
                    return acknowledge({
                        success: false,
                        message: 'You are no longer in this call'
                    })
                }

                // A later update may finish its database check first.
                if (socket.data.mediaStateVersion !== stateVersion) {
                    return acknowledge({ success: true })
                }
                socket.data.cameraEnabled = cameraEnabled
                socket.data.screenSharing = screenSharing
                broadcastMediaPeers(roomChannel)

                acknowledge({ success: true })
            } catch {
                acknowledge({
                    success: false,
                    message: 'Unable to update camera state'
                })
            }
        })
    })
}

module.exports = { registerRoomEvents }
