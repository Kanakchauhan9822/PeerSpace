import { useEffect, useRef, useState } from 'react'
import RemoteVideo from './RemoteVideo'
import { getRoomIceServers } from '../services/room.api'
import { replaceVideoTrack } from '../services/mediaTracks'

export default function RoomMedia({ roomId, socket }) {
    const videoRef = useRef(null)
    const streamRef = useRef(null)
    const peerConnectionsRef = useRef(new Map())
    const [starting, setStarting] = useState(false)
    const [mediaReady, setMediaReady] = useState(false)
    const [micEnabled, setMicEnabled] = useState(false)
    const [cameraEnabled, setCameraEnabled] = useState(false)
    const [micStarting, setMicStarting] = useState(false)
    const micStartingRef = useRef(false)
    const [error, setError] = useState('')
    const mountedRef = useRef(false)
    const startingRef = useRef(false)
    const [peers, setPeers] = useState([])
    const [callStatus, setCallStatus] = useState('')
    const [cameraStarting, setCameraStarting] = useState(false)
    const cameraStartingRef = useRef(false)
    const [remoteStreams, setRemoteStreams] = useState([])
    const [callAttempt, setCallAttempt] = useState(0)
    const [screenSharing, setScreenSharing] = useState(false)
    const [screenStarting, setScreenStarting] = useState(false)
    const screenStreamRef = useRef(null)
    const screenStartingRef = useRef(false)
    const cameraBeforeSharingRef = useRef(false)
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
        if (!socket?.connected || !mediaReady) return

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

            if (connectionId < peer.socketId) {
                audioSender = pc.addTransceiver(audioTrack || 'audio', {
                    direction: 'sendrecv',
                    streams: [stream]
                }).sender

                videoSender = pc.addTransceiver(videoTrack || 'video', {
                    direction: 'sendrecv',
                    streams: [stream]
                }).sender
            }


            const entry = {
                pc,
                videoSender,
                audioSender,
                pendingCandidates: [],
                remoteStream: new MediaStream(),
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

                entry.remoteStream.addTrack(event.track)

                setRemoteStreams(previous => [
                    ...previous.filter(item => item.socketId !== peer.socketId),
                    {
                        socketId: peer.socketId,
                        userId: peer.userId,
                        stream: entry.remoteStream
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

                for (const transceiver of pc.getTransceivers()) {
                    if (transceiver.mid === null) continue

                    const kind = transceiver.receiver.track.kind
                    const track = stream.getTracks().find(
                        item => item.kind === kind && item.readyState === 'live'
                    )

                    transceiver.direction = 'sendrecv'
                    transceiver.sender.setStreams(stream)

                    if (kind === 'video') {
                        entry.videoSender = transceiver.sender
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
                            !screenStreamRef.current &&
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

                        if (peerConnectionsRef.current.size === 0) {
                            setCallStatus('Waiting for another call participant')
                        }
                        // Capture may change while the server checks room membership.
                        // Publish the current source once joining has completed.
                        const sharing = Boolean(screenStreamRef.current)
                        socket.timeout(5000).emit('webrtc:camera-state', {
                            roomId,
                            screenSharing: sharing,
                            cameraEnabled: !sharing && Boolean(
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
    }, [socket, roomId, mediaReady, callAttempt])

    async function handleEnableMedia() {
        if (startingRef.current || screenStartingRef.current || streamRef.current) return

        startingRef.current = true
        setStarting(true)
        setError('')

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            })

            if (!mountedRef.current) {
                stream.getTracks().forEach(track => track.stop())
                return
            }

            streamRef.current = stream

            if (videoRef.current) {
                videoRef.current.srcObject = stream
            }

            setMediaReady(true)
            setMicEnabled(true)
            setCameraEnabled(true)
        } catch (err) {
            if (!mountedRef.current) return

            setError(
                err.name === 'NotAllowedError'
                    ? 'Please allow camera and microphone access.'
                    : 'Unable to access your camera or microphone. Check your devices and try again.'
            )
        } finally {
            startingRef.current = false

            if (mountedRef.current) {
                setStarting(false)
            }
        }
    }

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

    function sendCameraState(enabled, sharing = false) {
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

        if (!stream || cameraStartingRef.current || screenStartingRef.current || screenStreamRef.current) return

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

    async function stopScreenSharing() {
        const capture = screenStreamRef.current
        const stream = streamRef.current
        if (!capture || !stream || screenStartingRef.current) return

        screenStartingRef.current = true
        setScreenStarting(true)
        screenStreamRef.current = null
        capture.getTracks().forEach(track => {
            track.onended = null
            track.stop()
        })
        setScreenSharing(false)
        setCameraEnabled(false)
        sendCameraState(false)
        if (videoRef.current) videoRef.current.srcObject = null

        let cameraStream
        try {
            await replaceVideoTrack(stream, peerConnectionsRef.current, null)
            if (!mountedRef.current || streamRef.current !== stream) return

            if (cameraBeforeSharingRef.current) {
                cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                if (!mountedRef.current || streamRef.current !== stream) {
                    cameraStream.getTracks().forEach(track => track.stop())
                    return
                }
                const track = cameraStream.getVideoTracks()[0]
                await replaceVideoTrack(stream, peerConnectionsRef.current, track)
                if (!mountedRef.current || streamRef.current !== stream) {
                    cameraStream.getTracks().forEach(item => item.stop())
                    return
                }
                if (videoRef.current) videoRef.current.srcObject = stream
                setCameraEnabled(true)
                sendCameraState(true)
            }
        } catch {
            cameraStream?.getTracks().forEach(track => track.stop())
            if (mountedRef.current) {
                setError('Screen sharing stopped, but the camera could not be restored. Try turning it on or reconnecting.')
            }
        } finally {
            screenStartingRef.current = false
            if (mountedRef.current) setScreenStarting(false)
        }
    }

    async function startScreenSharing() {
        const previousStream = streamRef.current
        const stream = previousStream || new MediaStream()
        if (startingRef.current || screenStartingRef.current || cameraStartingRef.current || screenStreamRef.current) return
        if (!navigator.mediaDevices?.getDisplayMedia) {
            setError('Screen sharing is not supported in this browser. You can still view other participants’ screens.')
            return
        }

        screenStartingRef.current = true
        setScreenStarting(true)
        setError('')
        let capture
        let installed = false
        const previousTrack = stream.getVideoTracks()[0]
        cameraBeforeSharingRef.current = previousTrack?.readyState === 'live'

        try {
            // Called directly from the click handler, before any other await.
            capture = await navigator.mediaDevices.getDisplayMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 15, max: 30 } },
                audio: false
            })
            if (!mountedRef.current || streamRef.current !== previousStream) {
                capture.getTracks().forEach(track => track.stop())
                return
            }
            const track = capture.getVideoTracks()[0]
            if (!track || track.readyState !== 'live') throw new Error('Screen capture ended')
            streamRef.current = stream
            track.contentHint = 'detail'
            screenStreamRef.current = capture
            track.onended = () => { void stopScreenSharing() }

            await replaceVideoTrack(stream, peerConnectionsRef.current, track)
            installed = true
            previousTrack?.stop()
            if (!mountedRef.current || streamRef.current !== stream) {
                capture.getTracks().forEach(item => item.stop())
                return
            }

            if (videoRef.current) videoRef.current.srcObject = stream
            setCameraEnabled(false)
            setScreenSharing(true)
            setMediaReady(true)
            // The initial webrtc:ready announces screen-only calls after setup.
            if (previousStream) sendCameraState(false, true)
        } catch (err) {
            capture?.getTracks().forEach(track => {
                track.onended = null
                track.stop()
            })
            screenStreamRef.current = null
            if (!previousStream && streamRef.current === stream) streamRef.current = null
            if (mountedRef.current && err.name !== 'NotAllowedError') {
                setError('Unable to share this screen. Your previous video source has been kept. Try again.')
            }
        } finally {
            screenStartingRef.current = false
            if (mountedRef.current) {
                setScreenStarting(false)
                // The browser's Stop button may have been pressed during replaceTrack.
                if (installed && capture?.getVideoTracks()[0]?.readyState === 'ended') {
                    void stopScreenSharing()
                }
            }
        }
    }

    return (
        <section>
            <h2>Camera, microphone and screen</h2>

            {mediaReady && (
                <p role="status">
                    {socket
                        ? `${callStatus} — Other call participants: ${peers.length}`
                        : 'Waiting for room connection...'}
                </p>
            )}
            {screenSharing && <p role="status">You are sharing your screen. Microphone controls still apply.</p>}
            <video ref={videoRef} autoPlay muted playsInline style={{
                transform: screenSharing ? 'none' : 'scaleX(-1)',
                display: mediaReady && (cameraEnabled || screenSharing) ? 'block' : 'none',
                maxWidth: '100%'
            }} />
            {mediaReady && !cameraEnabled && !screenSharing && <p>Camera off</p>}

            {socket && remoteStreams.map(participant => (
                <RemoteVideo
                    key={participant.socketId}
                    stream={participant.stream}
                    cameraEnabled={
                        peers.find(peer => peer.socketId === participant.socketId)
                            ?.cameraEnabled === true
                    }
                    screenSharing={
                        peers.find(peer => peer.socketId === participant.socketId)
                            ?.screenSharing === true
                    }
                />
            ))}

            <button
                type="button"
                onClick={handleEnableMedia}
                disabled={starting || mediaReady || screenStarting}
            >
                {starting ? 'Starting...' : mediaReady ? 'Media enabled' : 'Enable camera/mic'}
            </button>

            <button
                type="button"
                onClick={screenSharing ? stopScreenSharing : startScreenSharing}
                disabled={starting || screenStarting || cameraStarting}
            >
                {screenStarting ? 'Switching video...' : screenSharing ? 'Stop sharing' : 'Share screen'}
            </button>

            {mediaReady && (
                <div>
                    <button
                        type="button"
                        disabled={!socket?.connected}
                        onClick={() => setCallAttempt(previous => previous + 1)}
                    >
                        Reconnect call
                    </button>
                    <button type="button" onClick={handleToggleMic} disabled={micStarting}>
                        {micStarting ? 'Starting microphone...' : micEnabled ? 'Mute microphone' : 'Enable microphone'}
                    </button>

                    <button
                        type="button"
                        onClick={handleToggleCamera}
                        disabled={cameraStarting || screenSharing || screenStarting}
                    >
                        {cameraStarting
                            ? 'Starting camera...'
                            : cameraEnabled
                                ? 'Turn camera off'
                                : 'Turn camera on'}
                    </button>


                </div>
            )}

            {error && <p role="alert">{error}</p>}
        </section>
    )
}
