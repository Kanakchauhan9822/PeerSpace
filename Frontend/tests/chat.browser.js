import React from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'

const roomId = '507f1f77bcf86cd799439011'
const userId = '507f1f77bcf86cd799439012'
const listeners = new Map()
const socket = {
    connected: true,
    on(name, fn) { listeners.set(name, fn) },
    off(name, fn) { if (listeners.get(name) === fn) listeners.delete(name) }
}
let counter = 0, deny = false, loseResponse = false, injectDuringHistory = true
function message(text, clientMessageId = 'seed') {
    counter += 1
    return { _id: counter.toString(16).padStart(24, '0'), roomId,
        sender: { _id: userId, username: 'Student' }, text, clientMessageId,
        createdAt: new Date().toISOString() }
}
const stored = Array.from({ length: 65 }, (_, i) => message(`History ${i + 1}`))
const attempts = []
function response(config, data) { return { status: 200, statusText: 'OK', headers: {}, config, data } }
axios.defaults.adapter = async config => {
    if (deny) throw { response: { status: 403, data: { message: 'Room membership required' } } }
    if (config.method === 'post') {
        const body = JSON.parse(config.data)
        attempts.push(body)
        let saved = stored.find(item => item.clientMessageId === body.clientMessageId)
        if (!saved) { saved = message(body.text, body.clientMessageId); stored.push(saved) }
        listeners.get('chat:message')?.(saved)
        if (loseResponse) { loseResponse = false; throw new Error('Lost response after save') }
        return response(config, { message: saved })
    }
    const before = config.params?.before
    const filtered = stored.filter(item => !before || item._id < before)
    const page = filtered.slice(-50)
    if (injectDuringHistory && !before) {
        injectDuringHistory = false
        const incoming = message('Live while history loads')
        stored.push(incoming)
        listeners.get('chat:message')?.(incoming)
    }
    return response(config, { messages: page, nextCursor: filtered.length > 50 ? page[0]._id : null })
}
const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (value, text) => { if (!value) throw new Error(text) }
async function until(predicate, text) {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await wait(20) }
    throw new Error(text)
}
const button = label => [...host.querySelectorAll('button')].find(item => item.textContent === label)
async function click(label) {
    await until(() => button(label) && !button(label).disabled, 'Missing button ' + label)
    button(label).click()
    await wait(40)
}
function type(text) {
    const element = host.querySelector('textarea')
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(element, text)
    element.dispatchEvent(new Event('input', { bubbles: true }))
}
const rows = () => [...host.querySelectorAll('li')]
const passed = []
async function run() {
    const { default: RoomChat } = await import('../src/features/rooms/components/RoomChat.jsx')
    const render = value => root.render(React.createElement(RoomChat, { key: roomId, roomId, socket: value, userId }))
    render(socket)
    await until(() => rows().length === 51, 'History/live merge lost a message')
    passed.push('history and concurrent live messages merge without loss')
    await click('Load older messages')
    assert(rows().length === 66 && rows()[0].textContent.includes('History 1'), 'Older history pagination failed')
    passed.push('older history loads in chronological order')

    const evil = message('<img src=x onerror=alert(1)>')
    listeners.get('chat:message')?.(evil)
    listeners.get('chat:message')?.(evil)
    listeners.get('chat:message')?.({ ...evil, _id: 'another-room', roomId: 'other' })
    await wait(40)
    assert(rows().length === 67 && !host.querySelector('img'), 'Duplicate, foreign-room or HTML message handling failed')
    passed.push('duplicate and foreign-room events ignored; HTML displayed as text')

    type('Retry-safe message')
    await wait(20)
    loseResponse = true
    await click('Send')
    assert(host.querySelector('textarea').value === 'Retry-safe message', 'Failed send lost draft')
    await click('Send')
    assert(attempts[0].clientMessageId === attempts[1].clientMessageId, 'Retry changed request ID')
    assert(rows().filter(row => row.textContent.includes('Retry-safe message')).length === 1, 'Reply/event caused duplicate')
    assert(host.querySelector('textarea').value === '', 'Successful send did not clear draft')
    passed.push('lost response preserves draft; retry reuses ID and deduplicates delivery')

    type('Keep while offline')
    await wait(20)
    render(null)
    await wait(40)
    assert(button('Send').disabled && host.querySelector('textarea').value === 'Keep while offline', 'Offline draft handling failed')
    stored.push(message('Missed while offline'))
    render(socket)
    await until(() => host.textContent.includes('Missed while offline'), 'Reconnect did not recover history')
    passed.push('disconnection retains draft and reconnect recovers missed history')

    render(null)
    await wait(40)
    const gapMessage = message('First message in long offline gap')
    stored.push(gapMessage)
    for (let i = 0; i < 60; i++) stored.push(message(`Offline batch ${i}`))
    render(socket)
    await until(() => host.textContent.includes('Offline batch 59'), 'Long reconnect did not refresh latest messages')
    await click('Load older messages')
    assert(host.textContent.includes('First message in long offline gap'), 'Pagination skipped the reconnect gap')
    passed.push('pagination after a long disconnection recovers the gap')

    deny = true
    render(null)
    await until(() => host.textContent.includes('Room membership required'), 'Access failure not displayed')
    assert(rows().length === 0 && host.querySelector('textarea').disabled, 'Revoked access retained messages')
    passed.push('membership denial clears visible history and disables sending')
    return passed
}
window.screenTestResult = run().then(passed => ({ passed })).catch(error => ({ passed, error: error.message })).finally(() => root.unmount())
