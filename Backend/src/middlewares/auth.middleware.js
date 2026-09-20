const jwt =require('jsonwebtoken')

function authUser(req,res,next){
    const token =req.cookies?.token
    
    if(!token){
        return res.status(401).json({
            message:'Please log in'
        })
    }

    try{
        const decoded=jwt.verify(token,process.env.JWT_SECRET)
        req.user=decoded
    }catch(err){
        return res.status(401).json({
            message:'Invalid or expired token'
        })
    }
    next()
}


module.exports={authUser}