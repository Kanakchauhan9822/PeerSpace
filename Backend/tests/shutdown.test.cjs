const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createShutdown } = require('../src/config/shutdown')

test('shutdown marks unready, drains sockets then disconnects database once', async () => {
    const calls = []
    const shutdown = createShutdown({
        app: { set: (key, value) => calls.push([key, value]) },
        io: { close: done => { calls.push('socket close'); done() } },
        mongoose: { disconnect: async () => { calls.push('database close') } },
        exit: code => calls.push(code)
    })
    await Promise.all([shutdown(), shutdown()])
    assert.deepEqual(calls, [['shuttingDown', true], 'socket close', 'database close', 0])
})

test('shutdown failure exits unsuccessfully', async () => {
    let result
    const shutdown = createShutdown({ app: { set() {} }, io: { close: done => done() },
        mongoose: { disconnect: async () => { throw new Error('failed') } }, exit: code => { result = code } })
    await shutdown()
    assert.equal(result, 1)
})
