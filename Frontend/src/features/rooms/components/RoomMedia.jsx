import { useEffect, useRef, useState } from 'react'
import RemoteVideo from './RemoteVideo'
import { getRoomIceServers } from '../services/room.api'
import { replaceVideoTrack } from '../services/mediaTracks'
import { galleryMembers } from '../services/gallery'
import ParticipantAvatar from './ParticipantAvatar'
import MediaControl from './MediaControl'

export default function RoomMedia({ roomId, socket, members = [], localUserId, hostId }) {
    const [galleryPage, setGalleryPage] = useState(0)
    const [maximizedScreen, setMaximizedScreen] = useState(null)
    const [fullWindowScreen, setFullWindowScreen] = useState(null)
    const [requestSending, setRequestSending] = useState(false)
    const [smallScreen, setSmallScreen] = useState(() => window.matchMedia('(max-width: 639px)').matches)
    useEffect(() => {
        const query = window.matchMedia('(max-width: 639px)')
        const update = event => setSmallScreen(event.matches)
        query.addEventListener('change', update)
        return () => query.removeEventListener('change', update)
    }, [])
    const videoRef = useRef(null)
    const streamRef = useRef(null)
    const peerConnectionsRef = useRef(new Map())
    const [micEnabled, setMicEnabled] = useState(false)
    const [cameraEnabled, setCameraEnabled] = useState(false)
    const [micStarting, setMicStarting] = useState(false)
    const micStartingRef = useRef(false)
    const [error, setError] = useState('')
    const mountedRef = useRef(false)
    const [peers, setPeers] = useState([])
    const [callStatus, setCallStatus] = useState('')
    const [cameraStarting, setCameraStarting] = useState(false)
    const cameraStartingRef = useRef(false)
    const [remoteStreams, setRemoteStreams] = useState([])
    const [callAttempt, setCallAttempt] = useState(0)
    const [screenSharing, setScreenSharing] = useState(false)
    const [localScreen, setLocalScreen] = useState(null)
    const [screenStarting, setScreenStarting] = useState(false)
    const screenStreamRef = useRef(null)
    const screenStartingRef = useRef(false)
    const screenMediaRef = useRef(null)
    const [approval, setApproval] = useState(null)
    const [requests, setRequests] = useState([])
    const isHost = Boolean(hostId && localUserId === hostId)
    const socketRef = useRef(socket)

    useEffect(() => {
        socketRef.current = socket
    }, [socket])

    useEffect(() => {
        mountedRef.current = true

        return () => {
            mountedRef.current = false
            screenStreamRef.current?.getTracks().forEach(track => {
                track.onended = null
                track.stop()
            })
            screenStreamRef.current = null
            streamRef.current?.getTracks().forEach(track => track.stop())
            streamRef.current = null
        }
    }, [])

    useEffect(() => {
        if (!socket?.connected) return

        // Join with empty media so watching never requires camera permission.
        // Reserve independent senders for camera and presentation.
        if (!streamRef.current) streamRef.current = new MediaStream()
        if (!screenMediaRef.current) screenMediaRef.current = new MediaStream()

        let active = true
        const connectionId = socket.id
        const connections = peerConnectionsRef.current
        let iceServers = []

        function createPeer(peer) {
            const existing = peerConnectionsRef.current.get(peer.socketId)
            if (existing) return existing

            const stream = streamRef.current
            const pc = new RTCPeerConnection({
                iceServers,
                iceTransportPolicy:
                    import.meta.env.DEV &&
                    new URLSearchParams(window.location.search).get('relay') === '1'
                        ? 'relay'
                        : 'all'
            })

            const audioTrack = stream.getAudioTracks()[0]
            const videoTrack = stream.getVideoTracks()[0]

            let videoSender = null
            let audioSender = null
            let screenSender = null

            if (connectionId < peer.socketId) {
                audioSender = pc.addTransceiver(audioTrack || 'audio', {
                    direction: 'sendrecv',
                    streams: [stream]
                }).sender

                videoSender = pc.addTransceiver(videoTrack || 'video', {
                    direction: 'sendrecv',
                    streams: [stream]
                }).sender
                screenSender = pc.addTransceiver(screenMediaRef.current.getVideoTracks()[0] || 'video', {
                    direction: 'sendrecv', streams: [screenMediaRef.current]
                }).sender
            }


            const entry = {
                pc,
                videoSender,
                screenSender,
                audioSender,
                pendingCandidates: [],
                remoteStream: new MediaStream(),
                remoteScreen: new MediaStream(),
                offerStarted: false,
                localCandidates: 0,
                receivedCandidates: 0,
                iceErrorCodes: []
            }

            peerConnectionsRef.current.set(peer.socketId, entry)

            async function reportConnectionFailure() {
                if (!import.meta.env.DEV) return

                try {
                    const stats = await pc.getStats()
                    if (!active || connections.get(peer.socketId) !== entry) return

                    const pairs = []
                    stats.forEach(report => {
                        if (report.type !== 'candidate-pair') return
                        const local = stats.get(report.localCandidateId)
                        const remote = stats.get(report.remoteCandidateId)
                        pairs.push({
                            state: report.state,
                            localType: local?.candidateType,
                            remoteType: remote?.candidateType,
                            relayTransport: local?.relayProtocol,
                            requestsSent: report.requestsSent,
                            responsesReceived: report.responsesReceived,
                            bytesSent: report.bytesSent,
                            bytesReceived: report.bytesReceived
                        })
                    })
                    console.warn('Call connection failed', JSON.stringify({
                        policy: pc.getConfiguration().iceTransportPolicy,
                        signaling: pc.signalingState,
                        gathering: pc.iceGatheringState,
                        pendingCandidates: entry.pendingCandidates.length,
                        localCandidates: entry.localCandidates,
                        receivedCandidates: entry.receivedCandidates,
                        iceErrorCodes: entry.iceErrorCodes
                    }))
                    console.table(pairs)
                } catch {
                    // Diagnostics must not interfere with reconnecting or cleanup.
                }
            }

            pc.onconnectionstatechange = () => {
                if (!active || peerConnectionsRef.current.get(peer.socketId) !== entry) return

                const states = [...peerConnectionsRef.current.values()].map(
                    item => item.pc.connectionState
                )

                if (states.includes('failed')) {
                    setCallStatus('A participant connection failed. Try reconnecting the call.')
                    if (pc.connectionState === 'failed') void reportConnectionFailure()
                } else if (states.includes('disconnected')) {
                    setCallStatus('A participant connection was interrupted.')
                } else if (states.every(state => state === 'connected')) {
                    setCallStatus('Call connected')
                } else {
                    setCallStatus('Connecting to participants...')
                }
            }

            pc.ontrack = event => {
                if (!active) return
                if (peerConnectionsRef.current.get(peer.socketId) !== entry) return

                const videos = pc.getTransceivers().filter(item => item.receiver.track.kind === 'video')
                const target = event.track.kind === 'video' && videos.indexOf(event.transceiver) === 1 ? entry.remoteScreen : entry.remoteStream
                target.addTrack(event.track)

                setRemoteStreams(previous => [
                    ...previous.filter(item => item.socketId !== peer.socketId),
                    {
                        socketId: peer.socketId,
                        userId: peer.userId,
                        stream: entry.remoteStream,
                        screenStream: entry.remoteScreen
                    }
                ])
            }

            pc.onicecandidateerror = event => {
                if (!active) return
                if (!entry.iceErrorCodes.includes(event.errorCode)) {
                    entry.iceErrorCodes.push(event.errorCode)
                }
            }

            pc.onicecandidate = event => {
                if (!active || !event.candidate) return
                entry.localCandidates += 1
                if (!socket.connected || socket.id !== connectionId) return
                if (peerConnectionsRef.current.get(peer.socketId) !== entry) return

                socket.timeout(5000).emit(
                    'webrtc:ice-candidate',
                    {
                        roomId,
                        targetSocketId: peer.socketId,
                        candidate: event.candidate.toJSON()
                    },
                    (err, response) => {
                        if (!active) return
                        if (peerConnectionsRef.current.get(peer.socketId) !== entry) return

                        if (err || !response?.success) {
                            setCallStatus('Unable to exchange call connection details.')
                        }
                    }
                )
            }


            return entry
        }

        function removePeer(socketId) {
            const entry = peerConnectionsRef.current.get(socketId)
            if (!entry) return

            peerConnectionsRef.current.delete(socketId)

            entry.pc.ontrack = null
            entry.pc.onicecandidate = null
            entry.pc.onicecandidateerror = null
            entry.pc.onconnectionstatechange = null
            entry.pc.close()

            entry.remoteScreen.getTracks().forEach(track => track.stop())
            entry.remoteStream.getTracks().forEach(track => track.stop())

            if (active) {
                setRemoteStreams(previous =>
                    previous.filter(item => item.socketId !== socketId)
                )
            }
        }

        async function startOffer(peer) {
            if (!active || !socket.connected) return
            if (socket.id !== connectionId) return
            if (connectionId >= peer.socketId) return

            let entry

            try {
                entry = createPeer(peer)

                if (entry.offerStarted) return
                entry.offerStarted = true

                const { pc } = entry
                const offer = await pc.createOffer()

                if (!active || pc.signalingState === 'closed') return

                await pc.setLocalDescription(offer)

                if (!active || !socket.connected) return
                if (socket.id !== connectionId) return
                if (peerConnectionsRef.current.get(peer.socketId) !== entry) return

                socket.timeout(5000).emit(
                    'webrtc:offer',
                    {
                        roomId,
                        targetSocketId: peer.socketId,
                        description: pc.localDescription.toJSON()
                    },
                    (err, response) => {
                        if (!active) return
                        if (peerConnectionsRef.current.get(peer.socketId) !== entry) return

                        if (err || !response?.success) {
                            removePeer(peer.socketId)
                            setCallStatus('Unable to start a participant connection.')
                        }
                    }
                )
            } catch {
                if (!active) return

                if (
                    entry &&
                    peerConnectionsRef.current.get(peer.socketId) === entry
                ) {
                    removePeer(peer.socketId)
                }

                setCallStatus('Unable to create a participant connection.')
            }
        }

        function handlePeers(data) {
            if (!active || data?.roomId !== roomId.toLowerCase()) return
            if (!Array.isArray(data.peers)) return

            const otherPeers = data.peers.filter(
                peer => peer.socketId !== connectionId
            )

            const currentIds = new Set(
                otherPeers.map(peer => peer.socketId)
            )

            for (const socketId of peerConnectionsRef.current.keys()) {
                if (!currentIds.has(socketId)) {
                    removePeer(socketId)
                }
            }

            setPeers(otherPeers)

            for (const peer of otherPeers) {
                void startOffer(peer)
            }
        }

        async function handleOffer(data) {
            if (!active || data?.roomId !== roomId.toLowerCase()) return
            if (data.fromSocketId === connectionId) return
            if (typeof data.fromSocketId !== 'string') return
            if (data.description?.type !== 'offer') return

            let entry

            try {
                entry = createPeer({
                    socketId: data.fromSocketId,
                    userId: data.fromUserId
                })

                const { pc } = entry

                await pc.setRemoteDescription(data.description)

                if (!active || pc.signalingState === 'closed') return

                for (const candidate of entry.pendingCandidates.splice(0)) {
                    await pc.addIceCandidate(candidate)
                }

                const stream = streamRef.current

                let videoIndex = 0
                for (const transceiver of pc.getTransceivers()) {
                    if (transceiver.mid === null) continue

                    const kind = transceiver.receiver.track.kind
                    const isScreen = kind === 'video' && videoIndex++ === 1
                    const source = isScreen ? screenMediaRef.current : stream
                    const track = source.getTracks().find(
                        item => item.kind === kind && item.readyState === 'live'
                    )

                    transceiver.direction = 'sendrecv'
                    transceiver.sender.setStreams(source)

                    if (kind === 'video') {
                        entry[isScreen ? 'screenSender' : 'videoSender'] = transceiver.sender
                    }
                    if (kind === 'audio') {
                        entry.audioSender = transceiver.sender
                    }
                    await transceiver.sender.replaceTrack(track || null)
                }

                const answer = await pc.createAnswer()

                if (!active || pc.signalingState === 'closed') return

                await pc.setLocalDescription(answer)

                if (!active || !socket.connected) return
                if (socket.id !== connectionId) return

                socket.timeout(5000).emit(
                    'webrtc:answer',
                    {
                        roomId,
                        targetSocketId: data.fromSocketId,
                        description: pc.localDescription.toJSON()
                    },
                    (err, response) => {
                        if (!active) return

                        if (err || !response?.success) {
                            setCallStatus('Unable to send the call answer.')
                        }
                    }
                )
            } catch {
                if (!active) return

                if (
                    entry &&
                    peerConnectionsRef.current.get(data.fromSocketId) === entry
                ) {
                    removePeer(data.fromSocketId)
                }

                setCallStatus('Unable to accept a participant connection.')
            }
        }

        async function handleAnswer(data) {
            if (!active || data?.roomId !== roomId.toLowerCase()) return
            if (typeof data.fromSocketId !== 'string') return
            if (data.description?.type !== 'answer') return

            const entry = peerConnectionsRef.current.get(data.fromSocketId)
            if (!entry) return

            const { pc } = entry

            if (pc.signalingState !== 'have-local-offer') return

            try {
                await pc.setRemoteDescription(data.description)

                if (!active || pc.signalingState === 'closed') return
                if (peerConnectionsRef.current.get(data.fromSocketId) !== entry) return

                for (const candidate of entry.pendingCandidates.splice(0)) {
                    await pc.addIceCandidate(candidate)
                }
            } catch {
                if (!active) return
                if (peerConnectionsRef.current.get(data.fromSocketId) !== entry) return

                removePeer(data.fromSocketId)
                setCallStatus('Unable to complete a participant connection.')
            }
        }

        async function handleIceCandidate(data) {
            if (!active || data?.roomId !== roomId.toLowerCase()) return
            if (typeof data.fromSocketId !== 'string') return
            if (data.fromSocketId === connectionId || !data.candidate) return

            let entry

            try {
                entry = createPeer({
                    socketId: data.fromSocketId,
                    userId: data.fromUserId
                })

                const { pc } = entry

                if (pc.signalingState === 'closed') return

                entry.receivedCandidates += 1

                if (!pc.remoteDescription) {
                    if (entry.pendingCandidates.length >= 100) {
                        throw new Error('Too many pending candidates')
                    }

                    entry.pendingCandidates.push(data.candidate)
                    return
                }

                await pc.addIceCandidate(data.candidate)
            } catch {
                if (!active) return
                if (
                    entry &&
                    peerConnectionsRef.current.get(data.fromSocketId) !== entry
                ) return

                setCallStatus('Unable to process a participant connection candidate.')
            }
        }

        async function initializeCall() {
            try {
                const data = await getRoomIceServers({ roomId })

                if (!active || !socket.connected || socket.id !== connectionId) return

                if (!Array.isArray(data.iceServers) || data.iceServers.length === 0) {
                    throw new Error('Missing call configuration')
                }

                iceServers = data.iceServers
                setRemoteStreams([])
                setPeers([])
                setCallStatus('Joining call...')

                socket.on('webrtc:peers', handlePeers)
                socket.on('webrtc:offer', handleOffer)
                socket.on('webrtc:answer', handleAnswer)
                socket.on('webrtc:ice-candidate', handleIceCandidate)

                socket.timeout(5000).emit(
                    'webrtc:ready',
                    {
                        roomId,
                        cameraEnabled: Boolean(
                            streamRef.current?.getVideoTracks().some(
                                track => track.readyState === 'live' && track.enabled
                            )
                        ),
                        screenSharing: Boolean(screenStreamRef.current)
                    },
                    (err, response) => {
                        if (!active || socket.id !== connectionId) return

                        if (err || !response?.success) {
                            setCallStatus(
                                response?.message || 'Unable to join the call. Please reload.'
                            )
                            return
                        }

                        socket.emit('screen:list', { roomId }, () => {})
                        if (peerConnectionsRef.current.size === 0) {
                            setCallStatus('Waiting for another call participant')
                        }
                        // Capture may change while the server checks room membership.
                        // Publish the current source once joining has completed.
                        const sharing = Boolean(screenStreamRef.current)
                        socket.timeout(5000).emit('webrtc:camera-state', {
                            roomId,
                            screenSharing: sharing,
                            cameraEnabled: Boolean(
                                streamRef.current?.getVideoTracks().some(
                                    track => track.readyState === 'live' && track.enabled
                                )
                            )
                        }, (stateError, stateResponse) => {
                            if (!active) return
                            if (stateError || !stateResponse?.success) {
                                setCallStatus('Unable to synchronize video status. Reconnect the call.')
                            }
                        })
                    }
                )
            } catch {
                if (!active || socket.id !== connectionId) return

                setCallStatus('Unable to load call configuration. Please reload.')
            }
        }

        void initializeCall()

        return () => {
            active = false
            screenStreamRef.current?.getTracks().forEach(track => { track.onended = null
                track.stop() })
            screenStreamRef.current = null
            screenMediaRef.current?.getTracks().forEach(track => screenMediaRef.current.removeTrack(track))
            queueMicrotask(() => {
                if (mountedRef.current) {
                    setScreenSharing(false)
                    setLocalScreen(null)
                    setApproval(null)
                }
            })
            for (const socketId of connections.keys()) {
                removePeer(socketId)
            }
            socket.off('webrtc:peers', handlePeers)

            socket.off('webrtc:offer', handleOffer)

            socket.off('webrtc:answer', handleAnswer)

            socket.off('webrtc:ice-candidate', handleIceCandidate)

            if (socket.connected && socket.id === connectionId) {
                socket.emit('webrtc:leave', () => { })
            }
        }
    }, [socket, roomId, callAttempt])

    async function handleToggleMic() {
        const stream = streamRef.current
        if (!stream || micStartingRef.current) return
        const existing = stream.getAudioTracks()[0]
        if (existing?.readyState === 'live') {
            existing.enabled = !existing.enabled
            setMicEnabled(existing.enabled)
            return
        }

        micStartingRef.current = true
        setMicStarting(true)
        setError('')
        let capture
        try {
            capture = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            if (!mountedRef.current || streamRef.current !== stream) {
                capture.getTracks().forEach(track => track.stop())
                return
            }
            const track = capture.getAudioTracks()[0]
            if (!track) throw new Error('No microphone track')
            if (existing) stream.removeTrack(existing)
            stream.addTrack(track)
            const results = await Promise.allSettled([...peerConnectionsRef.current.values()].map(async entry => {
                if (!entry.audioSender || entry.pc.signalingState === 'closed') return
                try {
                    await entry.audioSender.replaceTrack(track)
                } catch (error) {
                    if (entry.pc.signalingState !== 'closed') throw error
                }
            }))
            if (results.some(result => result.status === 'rejected')) throw new Error('Microphone connection failed')
            if (!mountedRef.current || streamRef.current !== stream) {
                track.stop()
                return
            }
            setMicEnabled(true)
        } catch {
            capture?.getTracks().forEach(track => {
                track.stop()
                stream.removeTrack(track)
            })
            if (mountedRef.current) {
                setMicEnabled(false)
                setError('Unable to enable the microphone. Check permissions and try again.')
            }
        } finally {
            micStartingRef.current = false
            if (mountedRef.current) setMicStarting(false)
        }
    }

    function sendCameraState(enabled, sharing = Boolean(screenStreamRef.current)) {
        const currentSocket = socketRef.current
        if (!currentSocket?.connected) return

        currentSocket.timeout(5000).emit(
            'webrtc:camera-state',
            { roomId, cameraEnabled: enabled, screenSharing: sharing },
            (err, response) => {
                if (!mountedRef.current) return

                if (err || !response?.success) {
                    setError('Unable to update your video status for others. Reconnect the call.')
                }
            }
        )
    }

    async function handleToggleCamera() {
        const stream = streamRef.current

        if (!stream || cameraStartingRef.current) return

        const currentTrack = stream.getVideoTracks()[0]

        cameraStartingRef.current = true
        setCameraStarting(true)
        setError('')

        try {
            if (currentTrack) {
                await replaceVideoTrack(stream, peerConnectionsRef.current, null)
                currentTrack.stop()
                if (!mountedRef.current) return
                if (videoRef.current) videoRef.current.srcObject = null
                setCameraEnabled(false)
                sendCameraState(false)
                return
            }

            const cameraStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            })

            if (!mountedRef.current || streamRef.current !== stream) {
                cameraStream.getTracks().forEach(track => track.stop())
                return
            }

            const newTrack = cameraStream.getVideoTracks()[0]
            try {
                await replaceVideoTrack(stream, peerConnectionsRef.current, newTrack)
            } catch (err) {
                newTrack.stop()
                throw err
            }
            if (!mountedRef.current || streamRef.current !== stream) {
                newTrack.stop()
                return
            }

            if (videoRef.current) {
                videoRef.current.srcObject = stream
            }

            setCameraEnabled(true)
            sendCameraState(true)
        } catch {
            if (mountedRef.current) {
                setError('Unable to start the camera. Check permissions and try again.')
            }
        } finally {
            cameraStartingRef.current = false

            if (mountedRef.current) {
                setCameraStarting(false)
            }
        }
    }

    async function screenCommand(event, extra = {}) {
        const current = socketRef.current
        if (!current?.connected) throw new Error('Connect to the room first.')
        return new Promise((resolve, reject) => current.timeout(5000).emit(event, { roomId, ...extra }, (err, result) => {
            if (err || !result?.success) reject(new Error(result?.message || 'Unable to contact the host. Try again.'))
            else resolve(result)
        }))
    }

    useEffect(() => {
        if (!socket) return
        const decision = data => {
            if (data.roomId !== roomId.toLowerCase()) return
            setApproval(data.allowed ? { hostId: data.hostId, expiresAt: data.expiresAt } : null)
            if (!data.allowed) setError('The host declined your screen sharing request.')
        }
        const pending = data => { if (data?.roomId === roomId.toLowerCase() && Array.isArray(data.requests)) setRequests(data.requests) }
        socket.on('screen:decision', decision)
        socket.on('screen:requests', pending)
        socket.emit('screen:list', { roomId }, () => {})
        return () => {
            socket.off('screen:decision', decision)
            socket.off('screen:requests', pending)
        }
    }, [socket, roomId, hostId, isHost])

    useEffect(() => {
        if (!approval) return
        const timeout = setTimeout(() => setApproval(null), approval.expiresAt ? Math.max(0, approval.expiresAt - Date.now()) : 120000)
        return () => clearTimeout(timeout)
    }, [approval])

    async function requestScreen() {
        if (requestSending || approval?.pending) return
        setRequestSending(true)
        try {
            setError('')
            const result = await screenCommand('screen:request')
            setApproval(result.allowed ? { hostId, expiresAt: result.expiresAt } : { pending: true })
        } catch (err) { setError(err.message) }
        finally { setRequestSending(false) }
    }

    async function decideScreen(requestId, allowed) {
        try { await screenCommand('screen:decide', { requestId, allowed }) }
        catch (err) { setError(err.message) }
    }

    async function stopScreenSharing() {
        const capture = screenStreamRef.current
        screenStreamRef.current = null
        capture?.getTracks().forEach(track => { track.onended = null; track.stop() })
        setLocalScreen(null)
        setScreenSharing(false)
        setApproval(null)
        try {
            await replaceVideoTrack(screenMediaRef.current, peerConnectionsRef.current, null, 'screenSender')
            await screenCommand('screen:stop')
        } catch (err) { if (mountedRef.current) setError(err.message) }
    }

    async function startScreenSharing() {
        if (screenStartingRef.current || screenStreamRef.current) return
        if (!isHost && (!approval || approval.hostId !== hostId)) {
            await requestScreen()
            return
        }
        screenStartingRef.current = true
        setScreenStarting(true)
        setError('')
        const currentSocket = socketRef.current
        const connectionId = currentSocket?.id
        let capture
        try {
            capture = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
            if (!mountedRef.current || !currentSocket?.connected || currentSocket.id !== connectionId) throw new Error('The call disconnected. Try again.')
            await screenCommand('screen:start')
            if (!mountedRef.current || !currentSocket.connected || currentSocket.id !== connectionId) throw new Error('The call disconnected.')
            const track = capture.getVideoTracks()[0]
            if (!track || track.readyState !== 'live') throw new Error('Screen capture ended.')
            screenStreamRef.current = capture
            await replaceVideoTrack(screenMediaRef.current, peerConnectionsRef.current, track, 'screenSender')
            track.onended = () => { void stopScreenSharing() }
            if (track.readyState !== 'live' || !mountedRef.current) throw new Error('Screen capture ended.')
            setLocalScreen(capture)
            setScreenSharing(true)
            sendCameraState(Boolean(streamRef.current?.getVideoTracks()[0]), true)
        } catch (err) {
            if (mountedRef.current) setApproval(null)
            capture?.getTracks().forEach(track => track.stop())
            screenStreamRef.current = null
            if (capture) {
                await replaceVideoTrack(screenMediaRef.current, peerConnectionsRef.current, null, 'screenSender').catch(() => {})
                void screenCommand('screen:stop').catch(() => {})
            }
            if (mountedRef.current && err.name !== 'NotAllowedError') setError(err.message || 'Unable to share screen.')
        } finally {
            screenStartingRef.current = false
            if (mountedRef.current) setScreenStarting(false)
        }
    }

    const gallery = galleryMembers({ members, peers: socket ? peers : [], localUserId, cameraEnabled, screenSharing })
    const screens = [
        ...(screenSharing ? [{ id: 'screen-local', stream: localScreen, name: 'Your screen' }] : []),
        ...remoteStreams.filter(item => peers.some(peer => peer.socketId === item.socketId && peer.screenSharing)).map(item => ({
            id: 'screen-' + item.socketId, stream: item.screenStream,
            name: (gallery.find(member => member.socketId === item.socketId)?.name || 'Participant') + ' screen'
        }))
    ]
    const fullWindow = screens.some(screen => screen.id === fullWindowScreen) && maximizedScreen === fullWindowScreen
    useEffect(() => {
        if (!fullWindow) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const escape = event => { if (event.key === 'Escape') setFullWindowScreen(null) }
        window.addEventListener('keydown', escape)
        return () => {
            document.body.style.overflow = previousOverflow
            window.removeEventListener('keydown', escape)
        }
    }, [fullWindow])
    const focused = screens.some(screen => screen.id === maximizedScreen) ? maximizedScreen : null
    const tiles = focused ? gallery : [...screens, ...gallery]
    const pageSize = focused ? 3 : smallScreen ? 4 : 9
    const pageCount = Math.max(1, Math.ceil(tiles.length / pageSize))
    const currentPage = Math.min(galleryPage, pageCount - 1)
    const visible = tiles.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
    const columns = focused ? 2 : visible.length <= 1 ? 1 : visible.length <= 4 || smallScreen ? 2 : 3
    const rows = focused ? 3 : Math.ceil(visible.length / columns)
    const tileStyle = id => {
        if (focused && id === focused) return { gridColumn: 1, gridRow: '1 / span 3' }
        const index = visible.findIndex(item => item.id === id)
        return { display: index < 0 ? 'none' : undefined, order: index,
            ...(focused && index >= 0 ? { gridColumn: 2, gridRow: index + 1 } : {}) }
    }
    const localId = localUserId || 'local'
    const needsReconnect = /failed|interrupted|unable/i.test(callStatus)
    const screenLabel = requestSending ? 'Sending request...' : approval?.pending ? 'Waiting for host approval' : screenStarting ? 'Switching video...' : screenSharing ? 'Stop sharing' : isHost || (approval?.hostId === hostId && approval?.expiresAt) ? 'Share screen' : 'Request screen share'
    const micLabel = micStarting ? 'Starting microphone...' : micEnabled ? 'Mute microphone' : 'Enable microphone'
    const cameraLabel = cameraStarting ? 'Starting camera...' : cameraEnabled ? 'Turn camera off' : 'Turn camera on'

    return (
        <section className="panel !p-5 sm:!p-6">
            <div className="mb-2 flex items-center justify-between gap-3"><h2>Camera, microphone and screen</h2></div>

            {(
                <p role="status" className="text-xs text-muted">
                    {socket
                        ? `${callStatus} — Other call participants: ${peers.length}`
                        : 'Waiting for room connection...'}
                </p>
            )}
            {screenSharing && <p role="status">You are sharing your screen. Microphone controls still apply.</p>}
            {isHost && requests.length > 0 && <div className="screen-request-overlay">
                <section className="panel screen-request-dialog" role="dialog" aria-modal="true" aria-labelledby="screen-request-title">
                    <h2 id="screen-request-title">Screen sharing request</h2>
                    {requests.map(request => <div key={request.requestId}>
                        <p>{members.find(member => member.user?._id === request.userId)?.user?.username || 'A participant'} wants to share their screen.</p>
                        <div className="flex gap-3">
                            <button type="button" onClick={() => decideScreen(request.requestId, true)}>Allow</button>
                            <button type="button" onClick={() => decideScreen(request.requestId, false)}>Decline</button>
                        </div>
                    </div>)}
                </section>
            </div>}
            {approval?.pending && <p role="status">Request sent. Waiting for the host to allow screen sharing.</p>}
            {!screenSharing && approval?.hostId === hostId && <p role="status">Host approved. Click Share screen to choose what to share.</p>}
            <div className="gallery-shell">
            <div className={'media-grid paginated-gallery' + (focused ? ' presentation-gallery' : '')} style={{ gridTemplateColumns: focused ? 'minmax(0, 1fr) minmax(160px, 24%)' : 'repeat(' + columns + ', minmax(0, 1fr))', gridTemplateRows: 'repeat(' + rows + ', minmax(0, 1fr))' }}>
                {screens.map(screen => <div className={'screen-share-tile' + (fullWindow && screen.id === fullWindowScreen ? ' screen-share-full-window' : '')} key={screen.id} style={tileStyle(screen.id)}>
                    <RemoteVideo stream={screen.stream} screenSharing name={screen.name} />
                    <button type="button" className="screen-size-button" title={focused === screen.id ? 'Restore gallery' : 'Maximize shared screen'}
                        aria-label={focused === screen.id ? 'Restore gallery' : 'Maximize shared screen'}
                        onClick={() => { setFullWindowScreen(null); setMaximizedScreen(focused === screen.id ? null : screen.id); setGalleryPage(0) }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d={focused === screen.id
                                ? 'M3 9h6V3m6 0v6h6M3 15h6v6m6 0v-6h6'
                                : 'M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6'} />
                        </svg>
                        <span className="sr-only">{focused === screen.id ? 'Restore' : 'Maximize'}</span>
                    </button>
                    {focused === screen.id && <button type="button" className="screen-size-button screen-window-button"
                        title={fullWindow ? 'Exit full-window view (Esc)' : 'Fill website window'}
                        aria-label={fullWindow ? 'Exit full-window view' : 'Fill website window'}
                        onClick={() => setFullWindowScreen(fullWindow ? null : screen.id)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            {fullWindow ? <path d="M8 3v5H3m18 0h-5V3M3 16h5v5m8 0v-5h5" /> : <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 8h8v8m0-8-8 8" /></>}
                        </svg>
                    </button>}
                </div>)}
                <div className="video-tile" style={tileStyle(localId)}>
                    <video ref={videoRef} autoPlay muted playsInline style={{
                        transform: 'scaleX(-1)',
                        display: cameraEnabled ? 'block' : 'none',
                        maxWidth: '100%'
                    }} />
                    {(!cameraEnabled) && <ParticipantAvatar name="You" />}
                    <span className="video-label">You</span>
                </div>
                {socket && remoteStreams.map(participant => {
                    const member = gallery.find(item => item.socketId === participant.socketId)
                    return <RemoteVideo key={participant.socketId} stream={participant.stream}
                        name={member?.name || 'Participant'}
                        tileStyle={member ? tileStyle(member.id) : { display: 'none' }}
                        cameraEnabled={member?.cameraEnabled === true}
                        screenSharing={false} />
                })}
                {gallery.filter(member => !member.local && !remoteStreams.some(stream => socket && stream.socketId === member.socketId)).map(member => (
                    <div key={member.id} className="video-tile" style={tileStyle(member.id)}>
                        <ParticipantAvatar name={member.name} status={member.cameraEnabled || member.screenSharing ? 'Connecting video...' : 'Camera off'} />
                        <span className="video-label">{member.name}</span>
                    </div>
                ))}
            </div>
            {pageCount > 1 && <nav className="gallery-pages" aria-label="Participant pages">
                <button className="btn" type="button" aria-label="Previous participants" disabled={currentPage === 0} onClick={() => setGalleryPage(currentPage - 1)}>Prev</button>
                <span role="status">{currentPage + 1} / {pageCount}</span>
                <button className="btn" type="button" aria-label="Next participants" disabled={currentPage === pageCount - 1} onClick={() => setGalleryPage(currentPage + 1)}>Next</button>
            </nav>}
            </div>
            <p className="mb-3 text-xs text-muted">{gallery.length} participants / Cameras on first{pageCount > 1 ? ' / Audio continues across all pages' : ''}</p>

            <div className="call-controls">
                <MediaControl icon="screen" label={screenLabel} active={screenSharing}
                    disabled={!socket?.connected || screenStarting || requestSending || Boolean(approval?.pending)}
                    onClick={() => { void (screenSharing ? stopScreenSharing() : startScreenSharing()) }} />
                <MediaControl icon="mic" label={micLabel} active={micEnabled}
                    disabled={!socket?.connected || micStarting} onClick={handleToggleMic} />
                <MediaControl icon="camera" label={cameraLabel} active={cameraEnabled}
                    disabled={!socket?.connected || cameraStarting} onClick={handleToggleCamera} />
                {needsReconnect && <button type="button" disabled={!socket?.connected}
                    onClick={() => setCallAttempt(previous => previous + 1)}>
                    Reconnect call
                </button>}
            </div>
            {error && <p role="alert">{error}</p>}
        </section>
    )
}
