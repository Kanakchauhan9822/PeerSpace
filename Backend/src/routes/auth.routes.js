const {Router}=require('express')
const {registerUserController,loginUserController,getMeController}=require('../controller/auth.controller')
const { authUser } = require('../middlewares/auth.middleware');


const authRouter=Router()

authRouter.post('/register', registerUserController)


authRouter.post('/login', loginUserController)


authRouter.get('/get-me',authUser,getMeController)

module.exports=authRouter