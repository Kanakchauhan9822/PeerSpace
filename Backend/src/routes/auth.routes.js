const { httpLimit } = require('../middlewares/requestLimits')
const {Router}=require('express')
const {registerUserController,loginUserController,getMeController,logoutUserController}=require('../controller/auth.controller')
const { authUser } = require('../middlewares/auth.middleware');


const authRouter=Router()


authRouter.post('/register', httpLimit(10, 15 * 60 * 1000), registerUserController)


authRouter.post('/login', httpLimit(30, 15 * 60 * 1000), loginUserController)


authRouter.get('/get-me',authUser,getMeController)


authRouter.post('/logout',logoutUserController)




module.exports=authRouter