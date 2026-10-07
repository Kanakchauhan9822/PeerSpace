const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema({
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    clientMessageId: { type: String, required: true, maxlength: 36 }
}, { timestamps: true })

messageSchema.index({ room: 1, _id: -1 })
// Retrying after a lost HTTP response must not create a second message.
messageSchema.index({ room: 1, sender: 1, clientMessageId: 1 }, { unique: true })

module.exports = mongoose.model('Message', messageSchema)
