const express = require('express');
const authRouter=require ('./routes/auth.routes')
const cors=require('cors')
const cookieParser =require('cookie-parser')
const roomRouter = require('./routes/room.routes');
const path = require('node:path')
const mongoose = require('mongoose')


const app=express();


app.use(cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials:true,
}))

app.use(express.json());

app.use(cookieParser());

app.use('/api/auth',authRouter)

app.use('/api/rooms', roomRouter);

app.get('/health', (req, res) => {
    const ready = !app.get('shuttingDown') && mongoose.connection.readyState === 1

    res.status(ready ? 200 : 503).json({
        status: ready ? 'ok' : 'unavailable'
    })
})


  if (process.env.NODE_ENV === 'production') {
    const frontendPath = path.resolve(__dirname, '../../Frontend/dist')

    app.use('/api', (req, res) => {
        res.status(404).json({ message: 'API route not found' })
    })

    app.use(express.static(frontendPath))

    app.get('/{*splat}', (req, res) => {
        res.sendFile(path.join(frontendPath, 'index.html'))
    })
} else {
    app.get('/', (req, res) => {
        res.send('PeerSpace API is running')
    })
}



module.exports=app;
