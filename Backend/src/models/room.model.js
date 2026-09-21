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
    ]
 } ,

 {timestamps:true}
)

const roomModel = mongoose.model('Room', roomSchema);


module.exports = roomModel;