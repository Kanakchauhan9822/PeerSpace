const {Router}=require('express')
const {registerUserController}=require('../controller/auth.controller')

const authRouter=Router()

authRouter.post('/register', registerUserController)

module.exports=authRouter