/* global process */
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const frontend = fileURLToPath(new URL('..', import.meta.url))
const profile = await mkdtemp(path.join(tmpdir(), 'peerspace-screen-test-'))
const executable = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
let server, browser, ws
const pending = new Map()
let sequence = 0
function command(method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = ++sequence
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
    })
}
try {
    server = await createServer({
        root: frontend,
        server: { host: '127.0.0.1', port: 5199, strictPort: true, open: false },
        plugins: [{
            name: 'screen-test-page',
            configureServer(vite) {
                vite.middlewares.use(async (req, res, next) => {
                    if (req.url !== '/__screen-test') return next()
                    const html = await vite.transformIndexHtml('/__screen-test',
                        '<html><body><script type="module" src="/tests/screen-sharing.browser.js"></script></body></html>')
                    res.setHeader('Content-Type', 'text/html')
                    res.end(html)
                })
            }
        }]
    })
    await server.listen()
    browser = spawn(executable, [
        '--headless=new', '--remote-debugging-port=0', '--no-first-run',
        '--disable-background-timer-throttling', '--autoplay-policy=no-user-gesture-required',
        '--user-data-dir=' + profile, 'about:blank'
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    const endpoint = await new Promise((resolve, reject) => {
        let output = ''
        const timeout = setTimeout(() => reject(new Error('Chrome startup timed out')), 15000)
        browser.once('error', reject)
        browser.stderr.on('data', data => {
            output += data
            const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/)
            if (match) { clearTimeout(timeout); resolve(match[1]) }
        })
    })
    const origin = endpoint.replace('ws:', 'http:').split('/devtools/')[0]
    const tabs = await (await fetch(origin + '/json/list')).json()
    ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl)
    await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }))
    ws.addEventListener('message', event => {
        const message = JSON.parse(event.data), task = pending.get(message.id)
        if (!task) return
        pending.delete(message.id)
        if (message.error) task.reject(new Error(message.error.message))
        else task.resolve(message.result)
    })
    await command('Page.navigate', { url: 'http://127.0.0.1:5199/__screen-test' })
    let started = false
    for (let i = 0; i < 100; i++) {
        const result = await command('Runtime.evaluate', { expression: 'Boolean(window.screenTestResult)', returnByValue: true })
        if (result.result.value) { started = true; break }
        await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!started) throw new Error('Browser test module did not load')
    const result = await command('Runtime.evaluate', {
        expression: 'window.screenTestResult', awaitPromise: true, returnByValue: true
    })
    const outcome = result.result.value
    console.log(JSON.stringify(outcome, null, 2))
    if (!outcome || outcome.error) process.exitCode = 1
} catch (error) {
    console.error(error.message)
    process.exitCode = 1
} finally {
    ws?.close()
    if (browser && browser.exitCode === null) {
        const exited = new Promise(resolve => browser.once('exit', resolve))
        browser.kill()
        await exited
    }
    await server?.close()
    // mkdtemp created this exact test-owned directory.
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {})
}
