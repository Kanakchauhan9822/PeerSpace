// Per-process limits for the single-instance deployment. Move to a shared store before scaling.
function createWindowLimit(max, windowMs, capacity = 10000) {
    const entries = new Map()
    return key => {
        const now = Date.now()
        let entry = entries.get(key)
        if (!entry || entry.until <= now) {
            if (entries.size >= capacity) {
                for (const [id, value] of entries) if (value.until <= now) entries.delete(id)
                if (entries.size >= capacity) return Math.ceil(windowMs / 1000)
            }
            entry = { count: 0, until: now + windowMs }
            entries.set(key, entry)
        }
        entry.count++
        return entry.count > max ? Math.max(1, Math.ceil((entry.until - now) / 1000)) : 0
    }
}
function httpLimit(max, windowMs, byUser = false) {
    const consume = createWindowLimit(max, windowMs)
    return (req, res, next) => {
        const retry = consume(byUser ? req.user.id : req.ip)
        if (!retry) return next()
        res.set('Retry-After', String(retry))
        res.status(429).json({ message: 'Too many requests. Please try again later.' })
    }
}
module.exports = { createWindowLimit, httpLimit }
