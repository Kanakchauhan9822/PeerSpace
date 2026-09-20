const userModel=require('../models/user.model.js')
const bcrypt =require('bcryptjs')
const jwt=require('jsonwebtoken')

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

async function loginUserController(req,res){
    const {email,password}=req.body?? {}

    if(typeof email !=="string" ||
       typeof password !=="string" ||  
       !email.trim() || 
       !password.trim()
        
    ){
    return res.status(400).json({
        message:"Invalid credentials entered"
    })}

   const  normalizedEmail= email.trim().toLowerCase()

    try{
        const user= await userModel.findOne({
            email:normalizedEmail
        },)
        if(!user){
            return res.status(401).json({
                message:"Invalid email or password"
            })
        }

       const pass= await bcrypt.compare(password,user.password)
        
       if(!pass){
            return res.status(401).json({
                message:"Invalid email or password"
            })
        }

        const token=jwt.sign(
            {id:user._id.toString()},
            process.env.JWT_SECRET,
            {expiresIn:'1h'}
        )

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 1000,
            path: '/',
            });

        return res.status(200).json({
            message: 'Logged in successfully.',
            user: {
            _id: user._id,
            username: user.username,
            email: user.email,
            },
            });

       }
    catch(err){
        return res.status(500).json({
            message:"unexpected error"
        })
    }
}

async function getMeController(req,res){
    try{
        const user=await userModel.findById(req.user.id).select('_id username email')

        if(!user){
            return res.status(401).json({
                message:'Please log in'
            })
        }

        return res.status(200).json({user})
    }catch(err){
        return res.status(500).json({
            message:'Unable to fetch user details'
        })
    }
}
module.exports= {registerUserController,
                loginUserController,
                getMeController
}