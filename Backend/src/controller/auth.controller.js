const userModel=require('../models/user.model.js')
const bcrypt =require('bcryptjs')

async function registerUserController(req,res){
    const{username,email,password}=req.body ??{};
    if(
        typeof username!='string' ||
        typeof email!='string' ||
        typeof password!='string' ||
        !username.trim()||
        !email.trim()||
        !password.trim()
    ){
        return res.status(400).json({
            message:'Username, email, and password are required.'
        })
    }
    const normalizedUsername=username.trim()
    const normalizedEmail = email.trim().toLowerCase();

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) {
        return res.status(400).json({
        message: 'Please provide a valid email address.',
    });
}

   try{
     const existingUser=await userModel.findOne({
            $or:[
                    {username:normalizedUsername},
                    {email:normalizedEmail}
                
            ],
        })
        if(existingUser){
            return res.status(409).json({
                message:'Username or email is already registered.'
            })
        }
        const hashedPassword= await bcrypt.hash(password,12)

        const user=await userModel.create({
            username:normalizedUsername,
            email:normalizedEmail,
            password:hashedPassword
        })
        
        return res.status(201).json({
            message:"User registered successfully",
            user:{
                _id:user._id,
                username:user.username,
                email:user.email
            }
        })
   }catch(err){
   
    if(err.code=== 11000){
    return res.status(409).json({
        message:"User is already registered"
    })
   }else{
    return res.status(500).json({
        message:"Unable to register user"
    })
   }
}
}



module.exports= {registerUserController}