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
            { returnDocument: 'after', runValidators: true }
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
    const { roomId } = req.params

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
        await room.populate([
            { path: 'host', select: '_id username' },
            { path: 'members.user', select: '_id username' },
        ]);
        return res.status(200).json({ room });
    } catch (error) {
        return res.status(500).json({
            message: 'Unable to fetch room.',
        });
    }
}

async function leaveRoomController(req,res){
    const {roomId}= req.params
    
    if(!mongoose.isObjectIdOrHexString(roomId)){
        return res.status(400).json({
            message:"Invalid room id"
        })
    }

    try{
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

        const remainingMembers=room.members
                                .filter((member)=>member.user.toString()!==req.user.id)
                                .sort((a,b)=>a.joinedAt-b.joinedAt)

        const isHost = room.host.toString()===req.user.id

        if (remainingMembers.length === 0) {
            const result = await roomModel.deleteOne({
                            _id: roomId,
                            'members.user': req.user.id,
                             members: { $size: 1 },
                            })
            if (result.deletedCount === 0) {
                return res.status(409).json({
                    message: 'Room membership changed. Please try leaving again.',
                });
            }

            return res.status(200).json({
                message: 'You left and the empty room was closed.',
                roomClosed: true,
            });
        }
         const updatedRoom= await roomModel.findOneAndUpdate(
                                {
                                _id: roomId,
                                 host: room.host,
                                members: { $size: room.members.length },
                                'members._id': {
                                $all: room.members.map((member) => member._id),
                                    },
                                 },
                                {
                                $pull:{
                                    members:{user:req.user.id}
                                },
                                $set:{
                                        host: isHost ? remainingMembers[0].user:room.host,
                                    },
                                },
                                { returnDocument: 'after', runValidators: true })                    
       
                            
        
            if (!updatedRoom) {
                 return res.status(409).json({
                message: 'Room membership or host changed. Please try leaving again.',
                    })
                }

             return res.status(200).json({
                 message: 'You left the room.',
                           roomClosed: false,
    })
      }catch(err){
        return res.status(500).json({
            message:"Unable to leave room"
        })
    }

}

async function transferHostController(req, res) {
    const { roomId } = req.params;
    const { newHostId } = req.body ?? {};

    if (
        !mongoose.isObjectIdOrHexString(roomId) ||
        !mongoose.isObjectIdOrHexString(newHostId)
    ) {
        return res.status(400).json({
            message: 'Invalid room ID or new host ID.',
        });
    }

    const targetId = new mongoose.Types.ObjectId(newHostId);

    try {
        const room = await roomModel.findById(roomId);

        if (!room) {
            return res.status(404).json({
                message: 'Room not found.',
            });
        }

        if (!room.host.equals(req.user.id)) {
            return res.status(403).json({
                message: 'Only the host can transfer host control.',
            });
        }

        if (room.host.equals(targetId)) {
            return res.status(400).json({
                message: 'You are already the host.',
            });
        }

        const isMember = room.members.some(
            (member) => member.user.equals(targetId)
        );

        if (!isMember) {
            return res.status(400).json({
                message: 'The new host must be a room member.',
            });
        }

        const updatedRoom = await roomModel.findOneAndUpdate(
            {
                _id: roomId,
                host: req.user.id,
                'members.user': targetId,
            },
            {
                $set: { host: targetId },
            },
            { returnDocument: 'after', runValidators: true }
        );

        if (!updatedRoom) {
            return res.status(409).json({
                message:
                    'The host or room membership changed. Please refresh and try again.',
            });
        }

        return res.status(200).json({
            message: 'Host transferred successfully.',
            room: updatedRoom,
        });
    } catch (error) {
        return res.status(500).json({
            message: 'Unable to transfer host.',
        });
    }
}

module.exports = {createRoomController,
                  listRoomController,
                  joinRoomController,
                  getRoomController,
                  leaveRoomController,
                  transferHostController
}

