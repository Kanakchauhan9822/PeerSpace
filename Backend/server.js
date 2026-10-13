require('dotenv').config()
const app=require('./src/app')
const connectToDB=require('./src/config/database')
const http = require('node:http')
const { Server } = require('socket.io')
const port = process.env.PORT || 3000
const cookieParser = require('cookie-parser')
const { socketAuth } = require('./src/middlewares/socketAuth.middleware')
const { registerRoomEvents } = require('./src/sockets/room.socket')
const messageModel = require('./src/models/message.model')
const mongoose = require('mongoose')
const { createShutdown } = require('./src/config/shutdown')


const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
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
    await messageModel.init()
    
    server.listen(port,()=>{
    console.log(`Server is running on port ${port}`)
})
   }
   
   catch(err){
    console.error("Database connection failed",err.message)
    process.exit(1)
   }
}

const shutdown = createShutdown({ app, io, mongoose })
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)

startServer()
