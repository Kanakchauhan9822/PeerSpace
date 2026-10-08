const {Router}=require('express')
const {createRoomController, listRoomController,joinRoomController, getRoomController, leaveRoomController,transferHostController,endRoomController,getRoomIceServersController}=require('../controller/room.controller.js')
const { authUser } = require('../middlewares/auth.middleware');
const { listMessages, sendMessage } = require('../controller/message.controller')
const { startTimerController, pauseTimerController, resetTimerController, setTimerDurationController } = require('../controller/room.controller.js')


const roomRouter=Router()


roomRouter.post('/',authUser, createRoomController)

roomRouter.get('/',authUser,listRoomController)

roomRouter.post('/:roomId/join', authUser, joinRoomController)

roomRouter.post('/:roomId/leave', authUser, leaveRoomController)

roomRouter.get('/:roomId',authUser,getRoomController)

roomRouter.post('/:roomId/transfer-host',authUser,transferHostController)

roomRouter.post('/:roomId/end',authUser,endRoomController)

roomRouter.get('/:roomId/ice-servers',authUser,getRoomIceServersController)

roomRouter.get('/:roomId/messages', authUser, listMessages)
roomRouter.post('/:roomId/messages', authUser, sendMessage)
roomRouter.post('/:roomId/timer/start', authUser, startTimerController)
roomRouter.post('/:roomId/timer/pause', authUser, pauseTimerController)
roomRouter.post('/:roomId/timer/reset', authUser, resetTimerController)

roomRouter.post('/:roomId/timer/duration', authUser, setTimerDurationController)

module.exports=roomRouter
