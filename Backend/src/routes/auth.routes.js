const {Router}=require('express')
const {registerUserController,loginUserController,getMeController,logoutUserController}=require('../controller/auth.controller')
const { authUser } = require('../middlewares/auth.middleware');


const authRouter=Router()


authRouter.post('/register', registerUserController)


authRouter.post('/login', loginUserController)


authRouter.get('/get-me',authUser,getMeController)


authRouter.post('/logout',logoutUserController)




module.exports=authRouter