const {Router}=require('express')
const {createRoomController}=require('../controller/room.controller.js')
const { authUser } = require('../middlewares/auth.middleware');


const roomRouter=Router()


roomRouter.post('/',authUser, createRoomController)


module.exports=roomRouter