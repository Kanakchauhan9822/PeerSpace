function createShutdown({ app, io, mongoose, timeoutMs = 8000, exit = code => process.exit(code) }) {
    let stopping = false
    return async function shutdown() {
        if (stopping) return
        stopping = true
        app.set('shuttingDown', true)
        console.log('Shutting down server')
        const deadline = setTimeout(() => exit(1), timeoutMs)
        deadline.unref()
        try {
            // Socket.IO closes its sockets and the attached HTTP server.
            await new Promise(resolve => io.close(resolve))
            await mongoose.disconnect()
            clearTimeout(deadline)
            exit(0)
        } catch {
            clearTimeout(deadline)
            console.error('Unable to close all connections cleanly')
            exit(1)
        }
    }
}
module.exports = { createShutdown }
