const mongoose = require('mongoose')
const Room = require('../models/room.model')
const User = require('../models/user.model')
const Message = require('../models/message.model')

const sendWindows = new Map()
const windowMs = 10000
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fail(status, message) {
    return Object.assign(new Error(message), { status })
}

async function requireMember(roomId, userId) {
    if (!mongoose.isObjectIdOrHexString(roomId)) throw fail(400, 'Invalid room ID')
    if (!mongoose.isObjectIdOrHexString(userId)) throw fail(401, 'Please log in')
    const room = await Room.findById(roomId).select('members.user').lean()
    if (!room) throw fail(404, 'Room not found')
    if (!room.members.some(member => member.user.toString() === userId.toString())) {
        throw fail(403, 'Room membership required')
    }
}

function messageView(message) {
    return {
        _id: message._id.toString(),
        roomId: message.room.toString(),
        sender: { _id: message.sender.toString(), username: message.senderName },
        text: message.text,
        clientMessageId: message.clientMessageId,
        createdAt: message.createdAt
    }
}

function limitSending(userId) {
    const now = Date.now()
    // Bounded, per-process protection for the current single-backend deployment.
    if (sendWindows.size >= 1000) {
        for (const [key, value] of sendWindows) {
            if (value.until <= now) sendWindows.delete(key)
        }
    }
    let entry = sendWindows.get(userId)
    if (!entry || entry.until <= now) {
        if (sendWindows.size >= 10000) throw fail(503, 'Chat is busy. Please try again shortly.')
        entry = { count: 0, until: now + windowMs }
        sendWindows.set(userId, entry)
    }
    if (entry.count >= 10) throw fail(429, 'Sending too quickly. Please wait a few seconds.')
    entry.count += 1
}

async function listMessages(req, res) {
    res.set('Cache-Control', 'no-store')
    try {
        const { roomId } = req.params
        const { before } = req.query
        if (before !== undefined && (typeof before !== 'string' || !mongoose.isObjectIdOrHexString(before))) {
            throw fail(400, 'Invalid message cursor')
        }
        await requireMember(roomId, req.user.id)
        const filter = { room: roomId }
        if (before) filter._id = { $lt: before }
        const rows = await Message.find(filter).sort({ _id: -1 }).limit(51).lean()
        // Membership may change while the history query is running.
        await requireMember(roomId, req.user.id)
        const hasMore = rows.length > 50
        const page = rows.slice(0, 50)
        return res.json({
            messages: page.reverse().map(messageView),
            nextCursor: hasMore ? page[0]._id.toString() : null
        })
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to load messages' })
    }
}

async function sendMessage(req, res) {
    res.set('Cache-Control', 'no-store')
    try {
        const { roomId } = req.params
        const { text, clientMessageId } = req.body ?? {}
        if (typeof text !== 'string' || !text.trim() || text.length > 2000) {
            throw fail(400, 'Message must contain between 1 and 2000 characters')
        }
        if (typeof clientMessageId !== 'string' || !uuid.test(clientMessageId)) {
            throw fail(400, 'Invalid message request ID')
        }
        await requireMember(roomId, req.user.id)
        const key = { room: roomId, sender: req.user.id, clientMessageId }
        let message = await Message.findOne(key).lean()
        if (!message) {
            limitSending(req.user.id)
            const sender = await User.findById(req.user.id).select('username').lean()
            if (!sender) throw fail(401, 'Please log in again')
            try {
                message = await Message.findOneAndUpdate(key, {
                    $setOnInsert: { ...key, senderName: sender.username, text: text.trim() }
                }, { upsert: true, returnDocument: 'after', runValidators: true }).lean()
            } catch (error) {
                if (error.code !== 11000) throw error
                message = await Message.findOne(key).lean()
                if (!message) throw error
            }
        }
        if (message.text !== text.trim()) throw fail(409, 'This message request ID was already used')
        try {
            await requireMember(roomId, req.user.id)
        } catch (error) {
            // Room deletion can race with an in-flight send after its initial check.
            if (error.status === 404) await Message.deleteOne({ _id: message._id })
            throw error
        }
        const result = messageView(message)
        req.app.get('io')?.to(`room:${result.roomId}`).emit('chat:message', result)
        return res.json({ message: result })
    } catch (error) {
        return res.status(error.status || 500).json({ message: error.status ? error.message : 'Unable to send message. Please try again.' })
    }
}

module.exports = { listMessages, sendMessage }
