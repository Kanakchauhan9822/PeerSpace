const express = require('express');
const authRouter=require ('./routes/auth.routes')
const cors=require('cors')
const cookieParser =require('cookie-parser')
const roomRouter = require('./routes/room.routes');
const path = require('node:path')
const mongoose = require('mongoose')


const app=express()
app.disable('x-powered-by')
// Configure only the trusted reverse proxy addresses/hops at deployment.
if (process.env.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY)
app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.set('X-Frame-Options', 'DENY')
    next()
})
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    const origin = req.get('origin')
    const allowed = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
    if (origin && origin !== allowed && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return res.status(403).json({ message: 'Request origin is not allowed' })
    }
    next()
})


app.use(cors({
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    credentials:true,
}))

app.use(express.json({ limit: '32kb' }));

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



app.use((err, req, res, next) => {
    if (res.headersSent) return next(err)
    if (err.type === 'entity.too.large') return res.status(413).json({ message: 'Request body is too large' })
    if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON request' })
    res.status(500).json({ message: 'Unable to complete this request' })
})

module.exports=app
