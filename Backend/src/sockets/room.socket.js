const mongoose=require('mongoose')
const roomModel=require('../models/room.model')

function registerRoomEvents(io){
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
    io.on('connection',(socket)=>{
        socket.on('room:subscribe',async(payload,acknowledge)=>{
            if(typeof acknowledge !=='function') return

            const roomId=payload?.roomId
            
            if(typeof roomId!=='string' || !mongoose.isObjectIdOrHexString(roomId)){
                return acknowledge({
                    success:false,
                    message:'Invalid room Id'
                })
            }

            try{
                const room =await roomModel.findById(roomId)
                                  .select('members.user')
                                  .lean()

                if(!room){
                return acknowledge({
                    success:false,
                    message: 'Room not found'
                })
            }
                const isMember=room.members.some(
                    member=> member.user.toString()===socket.data.userId
                )

                if(!isMember){
                return acknowledge({
                success:false,
                message:'Join this room before subscribing'
                })
                }

                if(!socket.connected) return

                const roomChannel = `room:${room._id}`

                await socket.join(roomChannel)
                await broadcastPresence(roomChannel)

                acknowledge({
                success:true,
                roomId: room._id.toString()
                })
                }catch{
                    acknowledge({
                        success:false,
                        message:'Unable to subscribe to room'
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
            for (const roomChannel of subscribedRooms) {
            broadcastPresence(roomChannel).catch(err => {
            console.error('Unable to update room presence', err.message)
                 })
            }
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
            await broadcastPresence(roomChannel)

            acknowledge({ success: true })
        } catch {
            acknowledge({
                success: false,
                message: 'Unable to unsubscribe from room'
             })
            }
        })
    })
}

module.exports={registerRoomEvents}