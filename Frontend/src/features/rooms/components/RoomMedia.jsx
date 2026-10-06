import { useEffect, useRef, useState } from 'react'
import RemoteVideo from './RemoteVideo'
import { getRoomIceServers } from '../services/room.api'

export default function RoomMedia({ roomId, socket }) {
    const videoRef = useRef(null)
    const streamRef = useRef(null)
    const peerConnectionsRef = useRef(new Map())
    const [starting, setStarting] = useState(false)
    const [mediaReady, setMediaReady] = useState(false)
    const [micEnabled, setMicEnabled] = useState(true)
    const [cameraEnabled, setCameraEnabled] = useState(true)
    const [error, setError] = useState('')
    const mountedRef = useRef(false)
    const startingRef = useRef(false)
    const [peers, setPeers] = useState([])
    const [callStatus, setCallStatus] = useState('')
    const [cameraStarting, setCameraStarting] = useState(false)
    const cameraStartingRef = useRef(false)
    const [remoteStreams, setRemoteStreams] = useState([])
    const [callAttempt, setCallAttempt] = useState(0)

    useEffect(() => {
        mountedRef.current = true

        return () => {
            mountedRef.current = false
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

            if (connectionId < peer.socketId) {
                pc.addTransceiver(audioTrack || 'audio', {
                    direction: 'sendrecv',
                    streams: [stream]
                })

                videoSender = pc.addTransceiver(videoTrack || 'video', {
                    direction: 'sendrecv',
                    streams: [stream]
                }).sender
            }


            const entry = {
                pc,
                videoSender,
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
                    await transceiver.sender.replaceTrack(track || null)

                    if (kind === 'video') {
                        entry.videoSender = transceiver.sender
                    }
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
                        )
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
        if (startingRef.current || streamRef.current) return

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

    function handleToggleMic() {
        const track = streamRef.current?.getAudioTracks()[0]

        if (!track || track.readyState === 'ended') return

        track.enabled = !track.enabled
        setMicEnabled(track.enabled)
    }

    function sendCameraState(enabled) {
        if (!socket?.connected) return

        socket.timeout(5000).emit(
            'webrtc:camera-state',
            { roomId, cameraEnabled: enabled },
            (err, response) => {
                if (!mountedRef.current) return

                if (err || !response?.success) {
                    setError('Unable to update your camera status for others.')
                }
            }
        )
    }

    async function handleToggleCamera() {
        const stream = streamRef.current

        if (!stream || cameraStartingRef.current) return

        const currentTrack = stream.getVideoTracks()[0]

        if (currentTrack) {
            await Promise.all(
                [...peerConnectionsRef.current.values()].map(entry =>
                    entry.videoSender?.replaceTrack(null)
                )
            )
            currentTrack.stop()
            stream.removeTrack(currentTrack)

            if (videoRef.current) {
                videoRef.current.srcObject = null
            }

            setCameraEnabled(false)
            sendCameraState(false)
            return
        }

        cameraStartingRef.current = true
        setCameraStarting(true)
        setError('')

        try {
            const cameraStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            })

            if (!mountedRef.current || streamRef.current !== stream) {
                cameraStream.getTracks().forEach(track => track.stop())
                return
            }

            const newTrack = cameraStream.getVideoTracks()[0]
            stream.addTrack(newTrack)

            await Promise.all(
                [...peerConnectionsRef.current.values()].map(entry =>
                    entry.videoSender?.replaceTrack(newTrack)
                )
            )

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

    return (
        <section>
            <h2>Camera and microphone</h2>

            {mediaReady && (
                <p role="status">
                    {socket
                        ? `${callStatus} — Other call participants: ${peers.length}`
                        : 'Waiting for room connection...'}
                </p>
            )}
            <video ref={videoRef} autoPlay muted playsInline style={{ transform: 'scaleX(-1)' }} />

            {socket && remoteStreams.map(participant => (
                <RemoteVideo
                    key={participant.socketId}
                    stream={participant.stream}
                    cameraEnabled={
                        peers.find(peer => peer.socketId === participant.socketId)
                            ?.cameraEnabled === true
                    }
                />
            ))}

            <button
                type="button"
                onClick={handleEnableMedia}
                disabled={starting || mediaReady}
            >
                {starting ? 'Starting...' : mediaReady ? 'Media enabled' : 'Enable camera/mic'}
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
                    <button type="button" onClick={handleToggleMic}>
                        {micEnabled ? 'Mute microphone' : 'Unmute microphone'}
                    </button>

                    <button
                        type="button"
                        onClick={handleToggleCamera}
                        disabled={cameraStarting}
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
