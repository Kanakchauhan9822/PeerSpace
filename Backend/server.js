require('dotenv').config()
const app=require('./src/app')
const connectToDB=require('./src/config/database')

const port=3000;


async function startServer(){
   try{ 
    await connectToDB()
    
    app.listen(port,()=>{
    console.log(`Server is running on port ${port}`)
})
   }
   
   catch(err){
    console.error("Database connection failed",err.message)
    process.exit(1)
   }
}

startServer()