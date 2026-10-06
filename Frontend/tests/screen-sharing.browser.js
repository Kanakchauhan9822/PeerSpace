import React from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import RemoteVideo from '../src/features/rooms/components/RemoteVideo.jsx'
import { replaceVideoTrack } from '../src/features/rooms/services/mediaTracks.js'

// Synthetic capture avoids recording the developer's camera, microphone or desktop.
const tracks = []
const canvases = []
const audioContext = new AudioContext()
let mode = 'normal'
let resolvePicker
let denyCamera = false
let cameraRequests = 0
const events = []
const listeners = new Map()
let receiver
let receiverCandidates = []
let receiverError
let participantJoined = false
function joinParticipant() {
    participantJoined = true
    listeners.get('webrtc:peers')?.({ roomId: 'test-room', peers: [
        { socketId: 'test-local', userId: 'local', cameraEnabled: false, screenSharing: true },
        { socketId: 'zz-receiver', userId: 'remote', cameraEnabled: false, screenSharing: false }
    ] })
}
async function receiveOffer(payload, callback) {
    try {
        receiver = new RTCPeerConnection()
        receiver.onicecandidate = event => {
            if (event.candidate) listeners.get('webrtc:ice-candidate')?.({
                roomId: 'test-room', fromSocketId: 'zz-receiver', fromUserId: 'remote',
                candidate: event.candidate.toJSON()
            })
        }
        await receiver.setRemoteDescription(payload.description)
        for (const candidate of receiverCandidates.splice(0)) await receiver.addIceCandidate(candidate)
        await receiver.setLocalDescription(await receiver.createAnswer())
        await listeners.get('webrtc:answer')?.({ roomId: 'test-room', fromSocketId: 'zz-receiver',
            description: receiver.localDescription.toJSON() })
        callback?.(null, { success: true })
    } catch (error) { receiverError = error.message }
}
const socket = {
    connected: true,
    id: 'test-local',
    on(name, handler) { listeners.set(name, handler) },
    off(name) { listeners.delete(name) },
    timeout() { return this },
    emit(name, payload, callback) {
        events.push({ name, payload })
        if (name === 'webrtc:offer') { void receiveOffer(payload, callback); return }
        if (name === 'webrtc:ice-candidate') {
            if (receiver?.remoteDescription) {
                void receiver.addIceCandidate(payload.candidate).catch(error => { receiverError = error.message })
            } else receiverCandidates.push(payload.candidate)
        }
        if (name === 'webrtc:leave') {
            receiver?.close()
            receiver = null
            receiverCandidates = []
        }
        if (typeof payload === 'function') payload({ success: true })
        else callback?.(null, { success: true })
        if (name === 'webrtc:ready' && participantJoined) joinParticipant()
    }
}
function capture() {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 180
    canvas.getContext('2d').fillRect(0, 0, 320, 180)
    canvases.push(canvas)
    const stream = canvas.captureStream(15)
    tracks.push(...stream.getTracks())
    return stream
}
Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async options => {
    if (options.video) cameraRequests += 1
    if (denyCamera && options.video) throw new DOMException('Denied', 'NotAllowedError')
    const stream = options.video ? capture() : new MediaStream()
    if (options.audio) {
        const audio = audioContext.createMediaStreamDestination().stream.getAudioTracks()[0]
        tracks.push(audio)
        stream.addTrack(audio)
    }
    return stream
} })
Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => {
    if (mode === 'cancel') throw new DOMException('Cancelled', 'NotAllowedError')
    if (mode === 'pending') return new Promise(resolve => { resolvePicker = resolve })
    return capture()
} })
axios.defaults.adapter = async config => ({ data: { iceServers: [{ urls: 'stun:localhost:9' }] }, status: 200, statusText: 'OK', headers: {}, config })

const host = document.createElement('div')
document.body.append(host)
let root = createRoot(host)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const assert = (value, message) => { if (!value) throw new Error(message) }
async function until(predicate, message) {
    for (let i = 0; i < 100; i++) {
        if (predicate()) return
        await wait(20)
    }
    throw new Error(message)
}
const button = label => [...host.querySelectorAll('button')].find(item => item.textContent === label)
async function click(label) {
    await until(() => button(label) && !button(label).disabled, 'Missing enabled button: ' + label)
    button(label).click()
    await wait(40)
}
const preview = () => host.querySelector('video')
const lastState = () => events.filter(e => e.name === 'webrtc:camera-state').at(-1)?.payload
const passed = []
const drawing = setInterval(() => {
    canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = Date.now() % 2 ? 'blue' : 'green'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
    })
}, 100)

async function run() {
    const { default: RoomMedia } = await import('../src/features/rooms/components/RoomMedia.jsx')
    root.render(React.createElement(RoomMedia, { roomId: 'test-room', socket }))
    mode = 'cancel'
    await click('Share screen')
    assert(cameraRequests === 0 && !button('Reconnect call'), 'Initial picker cancellation started media')
    mode = 'normal'
    denyCamera = true
    await click('Share screen')
    await until(() => button('Stop sharing'), 'Screen-first capture did not start')
    assert(cameraRequests === 0 && preview().srcObject.getAudioTracks().length === 0, 'Screen sharing requested camera or microphone')
    joinParticipant()
    await until(() => receiver?.connectionState === 'connected' || receiverError, 'Screen-first participant did not connect')
    assert(!receiverError, receiverError)
    let screenFrames = 0
    for (let i = 0; i < 50 && !screenFrames; i++) {
        const stats = await receiver.getStats()
        stats.forEach(report => { if (report.type === 'inbound-rtp' && report.kind === 'video') screenFrames = report.framesDecoded || 0 })
        if (!screenFrames) await wait(100)
    }
    assert(screenFrames > 0, 'Screen-first call sent no video frames')
    await click('Enable microphone')
    assert(cameraRequests === 0 && preview().srcObject.getAudioTracks()[0]?.readyState === 'live', 'Independent microphone failed')
    await click('Stop sharing')
    assert(cameraRequests === 0 && button('Turn camera on'), 'Screen-first stop activated the camera')
    passed.push('share immediately without camera permission; screen reaches peer; microphone enabled independently')
    passed.push('initial picker cancellation is safe and screen-first stop keeps camera off')
    root.unmount()
    participantJoined = false
    denyCamera = false
    root = createRoot(host)
    root.render(React.createElement(RoomMedia, { roomId: 'test-room', socket }))
    await click('Enable camera/mic')
    await until(() => button('Share screen'), 'Media did not start')
    const initialCamera = preview().srcObject.getVideoTracks()[0]
    const mic = preview().srcObject.getAudioTracks()[0]

    mode = 'cancel'
    await click('Share screen')
    assert(initialCamera.readyState === 'live' && button('Share screen'), 'Cancel changed camera')
    passed.push('picker cancellation preserves camera')

    mode = 'normal'
    await click('Share screen')
    await until(() => button('Stop sharing'), 'Share did not start')
    assert(initialCamera.readyState === 'ended', 'Camera hardware track was not stopped')
    assert(mic.readyState === 'live' && preview().srcObject.getAudioTracks()[0] === mic, 'Microphone changed')
    assert(preview().style.transform === 'none', 'Screen preview mirrored')
    assert(lastState().screenSharing && !lastState().cameraEnabled, 'Wrong screen metadata')
    assert(button('Turn camera on').disabled, 'Camera switch allowed during sharing')
    passed.push('sharing stops camera, preserves microphone and publishes screen state')

    joinParticipant()
    await until(() => receiver?.connectionState === 'connected' || receiverError, 'Joining participant did not connect')
    assert(!receiverError, receiverError)
    let frames = 0
    for (let i = 0; i < 50 && !frames; i++) {
        const stats = await receiver.getStats()
        stats.forEach(report => { if (report.type === 'inbound-rtp' && report.kind === 'video') frames = report.framesDecoded || 0 })
        if (!frames) await wait(100)
    }
    assert(frames > 0, 'Joining participant did not receive screen video frames')
    passed.push('participant joining during sharing receives video over real WebRTC')

    const screen = preview().srcObject.getVideoTracks()[0]
    screen.stop()
    screen.dispatchEvent(new Event('ended'))
    await until(() => button('Share screen') && button('Turn camera off'), 'Browser stop did not restore camera')
    assert(preview().srcObject.getVideoTracks()[0].readyState === 'live', 'Camera not restored')
    assert(lastState().cameraEnabled && !lastState().screenSharing, 'Camera state not restored')
    passed.push('browser Stop restores previously enabled camera')

    await click('Turn camera off')
    const requestsBefore = cameraRequests
    await click('Share screen')
    await click('Stop sharing')
    assert(cameraRequests === requestsBefore && button('Turn camera on'), 'Camera-off preference lost')
    passed.push('sharing from camera-off leaves camera off afterward')

    await click('Turn camera on')
    await click('Share screen')
    denyCamera = true
    await click('Stop sharing')
    assert(button('Turn camera on') && host.textContent.includes('could not be restored'), 'Restoration denial not handled')
    denyCamera = false
    passed.push('camera restoration denial leaves capture stopped and exposes recovery')

    await click('Share screen')
    const activeScreen = preview().srcObject.getVideoTracks()[0]
    await click('Reconnect call')
    await until(() => events.filter(e => e.name === 'webrtc:ready').at(-1)?.payload.screenSharing, 'Reconnect lost screen metadata')
    assert(activeScreen.readyState === 'live', 'Reconnect stopped capture')
    root.unmount()
    assert(activeScreen.readyState === 'ended' && mic.readyState === 'ended', 'Unmount leaked capture')
    participantJoined = false
    passed.push('reconnect preserves sharing and unmount stops all capture')

    root = createRoot(host)
    root.render(React.createElement(RoomMedia, { roomId: 'test-room', socket }))
    await click('Enable camera/mic')
    mode = 'pending'
    await click('Share screen')
    root.unmount()
    clearInterval(drawing)
    receiver?.close()
    const lateCapture = capture()
    resolvePicker(lateCapture)
    await wait(80)
    assert(lateCapture.getTracks().every(t => t.readyState === 'ended'), 'Late picker result leaked')
    passed.push('leaving with picker open stops late capture')

    root = createRoot(host)
    const remote = capture()
    root.render(React.createElement(RemoteVideo, { stream: remote, cameraEnabled: false, screenSharing: true }))
    await until(() => preview(), 'Remote video absent')
    assert(preview().style.transform === 'none' && preview().style.display === 'block', 'Remote screen hidden or mirrored')
    root.render(React.createElement(RemoteVideo, { stream: remote, cameraEnabled: false, screenSharing: false }))
    await until(() => preview().style.display === 'none', 'Stopped remote video still visible')
    passed.push('remote screen visible without mirroring; stopped video hidden')

    const stream = capture(), old = stream.getVideoTracks()[0], next = capture().getVideoTracks()[0]
    const sender = { track: old, async replaceTrack(track) { this.track = track } }
    const connections = new Map([
        ['healthy', { pc: { signalingState: 'stable' }, videoSender: sender }],
        ['rejecting', { pc: { signalingState: 'stable' }, videoSender: { async replaceTrack(track) { if (track === next) throw new Error('Cannot replace') } } }]
    ])
    let rejected = false
    try { await replaceVideoTrack(stream, connections, next) } catch { rejected = true }
    assert(rejected && sender.track === old && stream.getVideoTracks()[0] === old, 'Partial failure did not roll back')
    passed.push('partial sender failure rolls back stream and successful senders')
    return passed
}

window.screenTestResult = run().then(passed => ({ passed })).catch(error => ({ passed, error: error.message })).finally(() => {
    root.unmount()
    tracks.forEach(track => track.stop())
    void audioContext.close()
})
