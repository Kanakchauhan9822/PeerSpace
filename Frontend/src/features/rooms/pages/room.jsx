import { useEffect, useState, useContext } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AuthContext } from '../../auth/auth.context.jsx'
import { getRoom, leaveRoom, transferHost, endRoom } from '../services/room.api'
import { createRoomSocket } from '../services/room.socket'
import RoomMedia from '../components/RoomMedia.jsx'
import RoomChat from '../components/RoomChat.jsx'


export default function Room() {
    const { roomId } = useParams()
    const [room, setRoom] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const navigate = useNavigate()
    const [leaving, setLeaving] = useState(false)
    const [leaveError, setLeaveError] = useState('')
    const { user } = useContext(AuthContext)
    const isHost = Boolean(user && room?.host?._id === user._id)
    const [transferring, setTransferring] = useState(false)
    const [transferMessage, setTransferMessage] = useState('')
    const [ending, setEnding] = useState(false)
    const [endError, setEndError] = useState('')
    const [copyMessage, setCopyMessage] = useState('')
    const [onlineUserIds, setOnlineUserIds] = useState([])
    const [connectionStatus, setConnectionStatus] = useState('Connecting...')
    const [mediaSocket, setMediaSocket] = useState(null)

    async function handleCopy(value) {
        try {
            await navigator.clipboard.writeText(value);
            setCopyMessage('Copied!');
        } catch {
            setCopyMessage('Unable to copy. Please copy manually.');
        }
    }

    async function handleLeave() {
        if (leaving || transferring || ending) return;

        setLeaving(true);
        setLeaveError('');


        try {
            await leaveRoom({ roomId });

            navigate('/', { replace: true });
        } catch (err) {
            setLeaveError(
                err.response?.data?.message ||
                'Unable to leave room. Please try again.'
            );
        } finally {
            setLeaving(false);
        }
    }
    async function handleTransferHost(newHostId) {
        if (transferring || leaving || ending || !isHost) return;

        const selectedMember = room.members.find(
            (member) => member.user?._id === newHostId
        );

        if (!selectedMember?.user) return;

        const confirmed = window.confirm(
            `Make ${selectedMember.user.username} the host?`
        );

        if (!confirmed) return;

        setTransferring(true);
        setTransferMessage('');

        try {
            const data = await transferHost({ roomId, newHostId });

            setRoom((previous) => ({
                ...previous,
                host: selectedMember.user,
            }));

            setTransferMessage(data.message);
        } catch (err) {
            setTransferMessage(
                err.response?.data?.message ||
                'Unable to transfer host. Please try again.'
            );
        } finally {
            setTransferring(false);
        }
    }

    async function handleEndRoom() {
        if (!isHost || ending || leaving || transferring) return;

        const confirmed = window.confirm(
            'End this room for everyone? The room will be deleted.'
        );

        if (!confirmed) return;

        setEnding(true);
        setEndError('');

        try {
            await endRoom({ roomId });
            navigate('/', { replace: true });
        } catch (err) {
            setEndError(
                err.response?.data?.message ||
                'Unable to end room. Please try again.'
            );
        } finally {
            setEnding(false);
        }
    }


    useEffect(() => {
        let active = true

        async function loadRoom() {
            setLoading(true)
            setError('')
            setRoom(null)

            try {
                const data = await getRoom({ roomId })

                if (active) {
                    setRoom(data.room)
                }
            } catch (err) {
                if (!active)
                    return
                if (err.response?.status === 404) {
                    navigate('/', { replace: true });
                    return
                }
                setError(
                    err.response?.data?.message ||
                    'Unable to load room. Please try again.'
                )
            } finally {
                if (active) {
                    setLoading(false)
                }
            }
        }

        loadRoom()

        return () => {
            active = false;
        }
    }, [roomId, navigate])

    useEffect(() => {
        const socket = createRoomSocket()
        let active = true

        socket.on('connect', () => {
            setConnectionStatus('Joining live room...')


            socket.timeout(5000).emit(
                'room:subscribe',
                { roomId },
                async (err, response) => {
                    if (!active || !socket.connected) return

                    if (err) {
                        setConnectionStatus('Room subscription timed out. Please reload.')
                        return
                    }

                    if (!response?.success) {
                        setConnectionStatus(
                            response?.message || 'Unable to connect to room updates'
                        )
                        return
                    }

                    setConnectionStatus('Connected')
                    setMediaSocket(socket)

                    try {
                        const data = await getRoom({ roomId })

                        if (!active || !socket.connected) return

                        setRoom(data.room)
                    } catch (err) {
                        if (!active) return

                        if (
                            err.response?.status === 403 ||
                            err.response?.status === 404
                        ) {
                            navigate('/', { replace: true })
                            return
                        }

                        setConnectionStatus('Unable to refresh room details. Please reload.')
                    }

                }
            )
        })

        socket.on('room:presence', data => {
            if (
                data?.roomId !== roomId.toLowerCase() ||
                !Array.isArray(data.userIds)
            ) return

            setOnlineUserIds(data.userIds)
        })

        socket.on('connect_error', err => {
            setOnlineUserIds([])

            setConnectionStatus(
                socket.active
                    ? 'Connection lost. Reconnecting...'
                    : 'Unable to connect. Please log in again.'
            )

            console.error('Socket connection failed:', err.message)

            setMediaSocket(null)
        })

        socket.on('disconnect', () => {
            setOnlineUserIds([])
            setConnectionStatus('Disconnected — reconnecting...')
            setMediaSocket(null)
        })


        socket.on('room:updated', async data => {

            if (data?.roomId !== roomId.toLowerCase()) return

            try {
                const response = await getRoom({ roomId })

                if (!active) return

                setRoom(response.room)
            } catch {
                if (!active) return

                setConnectionStatus(
                    'Unable to refresh room details. Please reload.'
                )
            }
        })

        socket.on('room:ended', data => {
            if (data?.roomId !== roomId.toLowerCase()) return

            navigate('/', { replace: true })
        })

        socket.on('room:left', data => {
            if (data?.roomId !== roomId.toLowerCase()) return

            navigate('/', { replace: true })
        })

        socket.connect()

        return () => {
            active = false
            socket.removeAllListeners()
            socket.disconnect()
        }
    }, [roomId, navigate])



    if (loading) {
        return <p>Loading room...</p>
    }

    if (error) {
        return <p role="alert">{error}</p>
    }

    if (!room) {
        return <p>Room not found.</p>
    }

    return (
        <main>
            <h1>{room.name}</h1>
            <p role="status">{connectionStatus}</p>
            <RoomMedia roomId={roomId} socket={mediaSocket} />
            <RoomChat key={roomId} roomId={roomId} socket={mediaSocket} userId={user?._id} />
            <button
                type="button"
                onClick={() => handleCopy(roomId)}
            >
                Copy Room ID
            </button>

            <button
                type="button"
                onClick={() =>
                    handleCopy(`${window.location.origin}/join/${roomId}`)
                }
            >
                Copy Invite Link
            </button>

            {copyMessage && <p role="status">{copyMessage}</p>}
            <p>Room ID: {room._id}</p>
            <p>Host: {room.host?.username ?? 'Unknown user'}</p>
            {isHost && <p>You are the host.</p>}
            <h2>Members</h2>
            <ul>
                {room.members.map((member) => (
                    <li key={member._id}>
                        {member.user?.username ?? 'Unknown user'}
                        <span>
                            {' — '}
                            {connectionStatus !== 'Connected'
                                ? 'Status unavailable'
                                : onlineUserIds.includes(member.user?._id)
                                    ? 'Online'
                                    : 'Offline'}
                        </span>
                        {isHost && member.user && member.user._id !== user._id && (
                            <button
                                type="button"
                                onClick={() => handleTransferHost(member.user._id)}
                                disabled={transferring || leaving || ending}
                            >
                                Make Host
                            </button>
                        )}
                    </li>
                ))}
            </ul>

            <p role="status">{transferMessage}</p>
            <button type="button" onClick={handleLeave}
                disabled={leaving || transferring || ending}>
                {leaving ? 'Leaving...' : 'Leave Room'}
            </button>
            {leaveError && <p role="alert">{leaveError}</p>}

            {isHost && (
                <button
                    type="button"
                    onClick={handleEndRoom}
                    disabled={ending || leaving || transferring}
                >
                    {ending ? 'Ending...' : 'End Room for Everyone'}
                </button>
            )}

            {endError && <p role="alert">{endError}</p>}
        </main>
    );
}
