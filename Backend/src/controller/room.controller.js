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

module.exports = {createRoomController,listRoomController}