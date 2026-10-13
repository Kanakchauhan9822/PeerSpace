import React from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'

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
let remoteSending = false
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
        if (remoteSending) {
            const stream = capture()
            const transceiver = receiver.getTransceivers().find(item => item.receiver.track.kind === 'video')
            transceiver.direction = 'sendrecv'
            transceiver.sender.setStreams(stream)
            await transceiver.sender.replaceTrack(stream.getVideoTracks()[0])
        }
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
axios.defaults.adapter = async config => {
    let data = { iceServers: [{ urls: 'stun:localhost:9' }] }
    if (config.url.endsWith('/messages')) {
        data = { messages: [], nextCursor: null }
        if (config.method === 'post') {
            const body = JSON.parse(config.data)
            const message = { _id: '000000000000000000000001', roomId: 'test-room',
                sender: { _id: 'local', username: 'Tester' }, text: body.text,
                clientMessageId: body.clientMessageId, createdAt: new Date().toISOString() }
            listeners.get('chat:message')?.(message)
            data = { message }
        }
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config }
}

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
    root.render(React.createElement(RoomMedia, { roomId: 'test-room', socket, localUserId: 'local', hostId: 'local' }))
    await until(() => listeners.has('webrtc:peers'), 'Call not subscribed')
    remoteSending = true
    joinParticipant()
    await until(() => receiver?.connectionState === 'connected' || receiverError, 'Receive-only failed')
    assert(!receiverError, receiverError)
    assert(cameraRequests === 0 && !button('Enable camera/mic'), 'Unexpected device request')
    passed.push('receive-only connection needs no device permission')
    mode = 'cancel'
    await click('Share screen')
    assert(!button('Stop sharing') && cameraRequests === 0, 'Cancel started capture')
    mode = 'normal'
    await click('Share screen')
    await until(() => button('Stop sharing'), 'Share not started')
    await click('Maximize')
    assert(host.querySelector('.presentation-gallery'), 'Maximize did not focus the screen')
    await click('Restore')
    assert(!host.querySelector('.presentation-gallery'), 'Restore did not return to gallery')
    const screen = preview().srcObject.getVideoTracks()[0]
    assert(cameraRequests === 0, 'Screen requested camera')
    await click('Turn camera on')
    await click('Enable microphone')
    const cameraVideo = [...host.querySelectorAll('video')].find(video => video.muted && video.style.transform === 'scaleX(-1)')
    const camera = cameraVideo.srcObject.getVideoTracks()[0]
    const mic = cameraVideo.srcObject.getAudioTracks()[0]
    assert(camera.readyState === 'live' && screen.readyState === 'live' && mic.readyState === 'live', 'Independent capture failed')
    assert(lastState().cameraEnabled && lastState().screenSharing, 'Combined state missing')
    let received = []
    for (let i = 0; i < 60; i++) {
        received = []
        const stats = await receiver.getStats()
        stats.forEach(report => { if (report.type === 'inbound-rtp' && report.kind === 'video' && report.framesDecoded > 0) received.push(report) })
        if (received.length === 2) break
        await wait(100)
    }
    assert(received.length === 2, 'Peer did not receive BOTH camera and screen frames')
    passed.push('camera and screen send separate live video tracks while microphone works')
    await click('Turn camera off')
    assert(camera.readyState === 'ended' && screen.readyState === 'live', 'Camera off stopped screen')
    await click('Turn camera on')
    const nextCamera = cameraVideo.srcObject.getVideoTracks()[0]
    screen.stop()
    screen.dispatchEvent(new Event('ended'))
    await until(() => button('Share screen'), 'Browser stop did not end sharing')
    assert(nextCamera.readyState === 'live', 'Screen stop interrupted camera')
    passed.push('camera and screen stop independently')
    mode = 'pending'
    await click('Share screen')
    root.unmount()
    const late = capture()
    resolvePicker(late)
    await wait(100)
    assert(late.getTracks().every(track => track.readyState === 'ended'), 'Late capture leaked')
    assert(nextCamera.readyState === 'ended' && mic.readyState === 'ended', 'Unmount leaked devices')
    passed.push('unmount releases devices and late picker capture')
    participantJoined = false
    root = createRoot(host)
    root.render(React.createElement(RoomMedia, { roomId: 'test-room', socket, localUserId: 'local', hostId: 'host' }))
    await click('Request screen share')
    assert(host.textContent.includes('Waiting for the host'), 'No pending request feedback')
    listeners.get('screen:decision')({ roomId: 'test-room', hostId: 'host', allowed: true, expiresAt: Date.now() + 120000 })
    await until(() => button('Share screen'), 'Approval did not unlock picker')
    mode = 'normal'
    await click('Share screen')
    await until(() => button('Stop sharing'), 'Approved share failed')
    passed.push('participant requests approval before opening screen picker')
    root.unmount()
    root = createRoot(host)
    root.render(React.createElement(RoomMedia, { roomId: 'test-room', socket, localUserId: 'host', hostId: 'host' }))
    await until(() => listeners.has('screen:requests'), 'Host request listener missing')
    listeners.get('screen:requests')({ roomId: 'test-room', requests: [{ requestId: 'request-1', userId: 'local' }] })
    await until(() => host.querySelector('[role="dialog"]'), 'Host approval prompt missing')
    await click('Allow')
    assert(events.some(event => event.name === 'screen:decide' && event.payload.requestId === 'request-1' && event.payload.allowed), 'Host Allow did not send decision')
    listeners.get('screen:requests')({ roomId: 'test-room', requests: [] })
    await until(() => !host.querySelector('[role="dialog"]'), 'Resolved request prompt remained')
    passed.push('host sees approval dialog and can allow sharing')
    root.unmount()
    root = createRoot(host)
    const { default: RemoteVideo } = await import('../src/features/rooms/components/RemoteVideo.jsx')
    const audioOnly = audioContext.createMediaStreamDestination().stream
    tracks.push(...audioOnly.getTracks())
    root.render(React.createElement(RemoteVideo, { stream: audioOnly, cameraEnabled: false }))
    await until(() => host.querySelector('audio')?.srcObject?.getAudioTracks().length === 1, 'Audio-only track missing')
    host.click()
    await until(() => !host.querySelector('audio').paused, 'Audio requires camera to start')
    assert(host.querySelector('video').style.display === 'none', 'Camera-off preview should remain hidden')
    assert(host.querySelector('video').muted, 'Video could duplicate remote audio')
    passed.push('audio-only participant plays with camera off through an independent audio element')
    root.unmount()
    root = createRoot(host)
    const { default: SpeakingIndicator } = await import('../src/features/rooms/components/SpeakingIndicator.jsx')
    await audioContext.resume()
    const tone = audioContext.createOscillator()
    const volume = audioContext.createGain()
    const destination = audioContext.createMediaStreamDestination()
    volume.gain.value = 0.1
    tone.connect(volume).connect(destination)
    tone.start()
    tracks.push(...destination.stream.getTracks())
    root.render(React.createElement(SpeakingIndicator, { stream: destination.stream }))
    await wait(100)
    host.click()
    await until(() => host.querySelector('[aria-label="Speaking"]'), 'Speaking indicator missing for audio activity')
    volume.gain.value = 0
    await until(() => !host.querySelector('[aria-label="Speaking"]'), 'Speaking indicator stayed on during silence')
    tone.stop()
    tone.disconnect()
    volume.disconnect()
    passed.push('speaking icon reacts to microphone activity and clears during silence')
    clearInterval(drawing)
    return passed
}

window.screenTestResult = run().then(passed => ({ passed })).catch(error => ({ passed, error: error.message })).finally(() => {
    root.unmount()
    tracks.forEach(track => track.stop())
    void audioContext.close()
})
