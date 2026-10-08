const mongoose =require('mongoose')

const roomSchema= new mongoose.Schema(
    {
        name:{
            type:String,
            required:true,
            trim:true

        },
        host:{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        members: [
        {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        joinedAt: {
            type: Date,
            default: Date.now,
                  },
         },
    ],
   timer: {
        durationSeconds: {
            type: Number,
            default: 25 * 60,
            min: 1
        },
        status: {
            type: String,
            enum: ['idle', 'running', 'paused'],
            default: 'idle'
        },
        endsAt: {
            type: Date,
            default: null
        },
        remainingSeconds: {
            type: Number,
            default: 25 * 60,
            min: 0
        }
    }
 } ,

 {timestamps:true}
)

const roomModel = mongoose.model('Room', roomSchema);


module.exports = roomModel;