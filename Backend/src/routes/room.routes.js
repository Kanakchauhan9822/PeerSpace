const {Router}=require('express')
const {createRoomController, listRoomController}=require('../controller/room.controller.js')
const { authUser } = require('../middlewares/auth.middleware');


const roomRouter=Router()


roomRouter.post('/',authUser, createRoomController)

roomRouter.get('/',authUser,listRoomController)


module.exports=roomRouter