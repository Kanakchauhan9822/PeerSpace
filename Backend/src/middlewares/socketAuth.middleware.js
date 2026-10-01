const jwt =require('jsonwebtoken')
const mongoose = require('mongoose')


function socketAuth(socket,next){
    const token =socket.request.cookies?.token
    
    if(!token || typeof token !=='string'){
        return next(new Error('Please log in'))
        }
    

    try{
        const decoded=jwt.verify(token,process.env.JWT_SECRET,{algorithms:['HS256']})
        
        if(typeof decoded.id!=='string'||!mongoose.isObjectIdOrHexString(decoded.id)){
            return next(new Error('Invalid session. Please log in again'))
        }
        
        socket.data.userId=decoded.id
        
    }catch{
        return next(new Error('Invalid or expired token'))
    }


    next()
}


module.exports={socketAuth}