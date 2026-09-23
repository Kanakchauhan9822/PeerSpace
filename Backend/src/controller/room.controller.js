const mongoose= require('mongoose')
const roomModel =require("../models/room.model.js")


async function createRoomController(req,res){
    const {name}=req.body ?? {}
    if(
        typeof name !="string" || 
        name.trim()===""
    )
        {
            return res.status(400).json({
                message:"Invalid name"
            })
        }

    try{
        const room= await roomModel.create({
            name:name.trim(),
            host:req.user.id,
            members:[{ user:req.user.id}]
        }) 
        
        return res.status(201).json({
        message:"Room created successfully",room
            })
        
    }catch(err){
        return res.status(500).json({
            message:"Unable to create room"
        })
    }
}

async function listRoomController(req,res){
    try{
        const rooms=await roomModel
                    .find({'members.user':req.user.id})
                    .sort({createdAt:-1})

        return res.status(200).json({
            message:"rooms",rooms
        })        
    }catch(err){
        return res.status(500).json({
            message:"Unable to fetch rooms."
        })
    }
}

async function joinRoomController(req,res){
const {roomId}= req.params

if(!mongoose.isObjectIdOrHexString(roomId)){
    return res.status(400).json({
        message:"Invalid Room ID"
    })
}

try{
    const room= await roomModel.findById(roomId)
    if(!room){
        return res.status(404).json({
            message:"Room not found"
        })
    }
    const updatedRoom = await roomModel.findOneAndUpdate(
            {
                _id: roomId,
                'members.user': { $ne: req.user.id },
            },
            {
                $push: {
                    members: {
                        user: req.user.id,
                        joinedAt: new Date(),
                    },
                },
            },
            { new: true, runValidators: true }
        );

        if (!updatedRoom) {
            return res.status(409).json({
                message:
                    'You are already a member, or the room is no longer available.',
            });
        }

        return res.status(200).json({
            message: 'Joined room successfully.',
            room: updatedRoom,
        })
}catch(err){
    return res.status(500).json({
        message:"Unable to join room."
    })
}
}

async function getRoomController(req, res) {
    const { roomId } = req.params;

    if (!mongoose.isObjectIdOrHexString(roomId)) {
        return res.status(400).json({
            message: 'Invalid room ID.',
        });
    }

    try {
        const room = await roomModel.findById(roomId);

        if (!room) {
            return res.status(404).json({
                message: 'Room not found.',
            });
        }

        const isMember = room.members.some(
            (member) => member.user.toString() === req.user.id
        );

        if (!isMember) {
            return res.status(403).json({
                message: 'You are not a member of this room.',
            });
        }

        return res.status(200).json({ room });
    } catch (error) {
        return res.status(500).json({
            message: 'Unable to fetch room.',
        });
    }
}

module.exports = {createRoomController,
                  listRoomController,
                  joinRoomController,
                  getRoomController
}

