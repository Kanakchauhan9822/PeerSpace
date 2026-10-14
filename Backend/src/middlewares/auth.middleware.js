const jwt =require('jsonwebtoken')
const mongoose = require('mongoose')

function authUser(req,res,next){
    const token =req.cookies?.token
    
    if(!token || typeof token !== 'string'){
        return res.status(401).json({
            message:'Please log in'
        })
    }

    try{
        const decoded=jwt.verify(token,process.env.JWT_SECRET,{ algorithms: ['HS256'] })
        if (typeof decoded.id !== 'string' || !mongoose.isObjectIdOrHexString(decoded.id)) throw new Error('Invalid identity')
        req.user={ id: decoded.id }
    }catch(err){
        return res.status(401).json({
            message:'Invalid or expired token'
        })
    }
    next()
}


module.exports={authUser}