const {Router}=require('express')
const {createRoomController, listRoomController,joinRoomController, getRoomController, leaveRoomController,transferHostController,endRoomController}=require('../controller/room.controller.js')
const { authUser } = require('../middlewares/auth.middleware');


const roomRouter=Router()


roomRouter.post('/',authUser, createRoomController)

roomRouter.get('/',authUser,listRoomController)

roomRouter.post('/:roomId/join', authUser, joinRoomController)

roomRouter.post('/:roomId/leave', authUser, leaveRoomController)

roomRouter.get('/:roomId',authUser,getRoomController)

roomRouter.post('/:roomId/transfer-host',authUser,transferHostController)

roomRouter.post('/:roomId/end',authUser,endRoomController)

module.exports=roomRouter
