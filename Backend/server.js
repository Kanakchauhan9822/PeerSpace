require('dotenv').config()
const app=require('./src/app')
const connectToDB=require('./src/config/database')
const http = require('node:http')
const { Server } = require('socket.io')
const port=3000
const cookieParser = require('cookie-parser')
const { socketAuth } = require('./src/middlewares/socketAuth.middleware')
const { registerRoomEvents } = require('./src/sockets/room.socket')


const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        origin: 'http://localhost:5173',
        credentials: true
    }
})
app.set('io', io)

io.engine.use(cookieParser())
io.use(socketAuth)

registerRoomEvents(io)

async function startServer(){
   try{ 
    await connectToDB()
    
    server.listen(port,()=>{
    console.log(`Server is running on port ${port}`)
})
   }
   
   catch(err){
    console.error("Database connection failed",err.message)
    process.exit(1)
   }
}

startServer()