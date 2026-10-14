import PageShell from '../../../components/PageShell'
import { Link } from 'react-router'
import { useEffect, useState, useContext } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AuthContext } from '../../auth/auth.context.jsx'
import { getRoom, leaveRoom, transferHost, endRoom, startTimer, pauseTimer, resetTimer, setTimerDuration } from '../services/room.api'
import { createRoomSocket } from '../services/room.socket'
import RoomMedia from '../components/RoomMedia.jsx'
import RoomChat from '../components/RoomChat.jsx'
import { removeMember } from '../services/room.api'
import RoomTimer from '../components/RoomTimer.jsx'


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
    const [removingMember, setRemovingMember] = useState(null)
    const [removeError, setRemoveError] = useState('')
    const [transferring, setTransferring] = useState(false)
    const [transferMessage, setTransferMessage] = useState('')
    const [ending, setEnding] = useState(false)
    const [endError, setEndError] = useState('')
    const [copyMessage, setCopyMessage] = useState('')
    const [onlineUserIds, setOnlineUserIds] = useState([])
    const [connectionStatus, setConnectionStatus] = useState('Connecting...')
    const [mediaSocket, setMediaSocket] = useState(null)
    const [startingTimer, setStartingTimer] = useState(false)
    const [timerError, setTimerError] = useState('')

    async function handleRemoveMember(member) {
        if (!isHost || removingMember || transferring || leaving || ending) return
        if (!window.confirm('Remove ' + member.username + ' from this room?')) return
        setRemovingMember(member._id)
        setRemoveError('')
        try {
            await removeMember({ roomId, memberId: member._id })
            setRoom(previous => previous ? {
                ...previous,
                members: previous.members.filter(item => item.user?._id !== member._id)
            } : previous)
        } catch (error) {
            setRemoveError(error.response?.data?.message || 'Unable to remove participant. Please try again.')
        } finally {
            setRemovingMember(null)
        }
    }

    async function handleCopy(value) {
        try {
            await navigator.clipboard.writeText(value);
            setCopyMessage('Copied!');
        } catch {
            setCopyMessage('Unable to copy. Please copy manually.');
        }
    }

    async function handleLeave() {
        if (removingMember || leaving || transferring || ending) return;

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
        if (removingMember || transferring || leaving || ending || !isHost) return;

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
        if (removingMember || !isHost || ending || leaving || transferring) return;

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

        useEffect(() => {
        if (!mediaSocket) return

        function handleTimerUpdated(data) {
            if (data?.roomId !== roomId.toLowerCase()) return

            setRoom(previous => previous
                ? { ...previous, timer: data.timer }
                : previous
            )
        }

        mediaSocket.on('timer:updated', handleTimerUpdated)

        return () => {
            mediaSocket.off('timer:updated', handleTimerUpdated)
        }
    }, [mediaSocket, roomId])

    async function handleTimerAction(action, minutes) {
        if (!isHost || startingTimer) return

        setStartingTimer(true)
        setTimerError('')

        try {
            const request = { start: startTimer, pause: pauseTimer, reset: resetTimer, duration: setTimerDuration }[action]
            const data = await request({ roomId, minutes })

            setRoom(previous => previous
                ? { ...previous, timer: data.timer }
                : previous
            )
        } catch (error) {
            setTimerError(
                error.response?.data?.message || 'Unable to update timer'
            )
        } finally {
            setStartingTimer(false)
        }
    }

    if (loading) {
        return <PageShell><main id="main-content" className="page-wrap py-16"><p role="status" className="panel">Loading your study room...</p></main></PageShell>
    }

    if (error) {
        return <PageShell><main id="main-content" className="page-wrap py-16"><p role="alert">{error}</p><Link className="btn" to="/">Back to your rooms</Link></main></PageShell>
    }

    if (!room) {
        return <PageShell><main id="main-content" className="page-wrap py-16"><p className="panel">Room not found.</p></main></PageShell>
    }

    return (
        <PageShell actions={<><span className="badge">{isHost ? 'Hosting' : 'Studying together'}</span><Link className="btn" to="/">Your rooms ↗</Link></>}>
            <main id="main-content" className="meeting-page mx-auto w-full px-3 pb-8 sm:px-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                    <div className="min-w-0"><h1 className="break-words text-2xl font-light">{room.name}</h1><p className="mt-1 text-xs text-muted">Hosted by {room.host?.username ?? 'Unknown user'} · {room.members.length} members</p></div>
                    <div className="flex flex-wrap gap-2">
                        <button className="btn" type="button" onClick={() => handleCopy(roomId)}>Copy Room ID</button>
                        <button className="btn btn-primary" type="button" onClick={() => handleCopy(window.location.origin + '/join/' + roomId)}>Copy Invite Link ↗</button>
                    </div>
                </div>
                {copyMessage && <p role="status" className="mb-4 text-sm text-muted">{copyMessage}</p>}
                <p role="status" className="badge mb-3"><span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{connectionStatus}</p>
                <RoomTimer timer={room.timer} isHost={isHost} busy={startingTimer} onAction={handleTimerAction} />
                {timerError && <p role="alert">{timerError}</p>}
                <div className="meeting-stage mb-5">
                    <RoomMedia roomId={roomId} socket={mediaSocket} members={room.members} localUserId={user?._id} hostId={room.host?._id} onlineUserIds={onlineUserIds} />
                </div>
                <div className="grid items-start gap-5 lg:grid-cols-2">
                    <div className="min-w-0 space-y-5">

                        <section className="panel" aria-labelledby="members-heading">
                            <div className="mb-5 flex items-center justify-between"><h2 id="members-heading">Around the table</h2><span className="badge">{room.members.length} members</span></div>
                            <ul className="divide-y divide-line">
                                {room.members.map(member => (
                                    <li key={member._id} className="flex flex-wrap items-center gap-3 py-4">
                                        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-[#26282a] font-serif text-lg">{(member.user?.username || '?').slice(0, 1).toUpperCase()}</span>
                                        <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{member.user?.username ?? 'Unknown user'}{member.user?._id === user._id ? ' (you)' : ''}</p><p className="text-xs text-muted">{room.host?._id === member.user?._id ? 'Host · ' : ''}{connectionStatus !== 'Connected' ? 'Status unavailable' : onlineUserIds.includes(member.user?._id) ? 'Online' : 'Offline'}</p></div>
                                        {isHost && member.user && member.user._id !== user._id && <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                                            <button className="btn !min-h-9 !px-3 !text-xs" type="button" disabled={Boolean(removingMember) || transferring || leaving || ending} onClick={() => handleTransferHost(member.user._id)}>Make Host</button>
                                            <button className="btn btn-danger !min-h-9 !px-3 !text-xs" type="button" disabled={Boolean(removingMember) || transferring || leaving || ending} onClick={() => handleRemoveMember(member.user)}>{removingMember === member.user._id ? 'Removing...' : 'Remove participant'}</button>
                                        </div>}
                                    </li>
                                ))}
                            </ul>
                            {removeError && <p role="alert">{removeError}</p>}
                            <p role="status" className="text-sm text-muted">{transferMessage}</p>
                        </section>
                    </div>
                    <aside className="min-w-0 space-y-5" aria-label="Conversation">

                        <RoomChat key={roomId} roomId={roomId} socket={mediaSocket} userId={user?._id} />
                    </aside>
                </div>
                <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
                    <p className="text-xs text-muted">Room ID: {room._id}</p>
                    <div className="flex flex-wrap gap-2">
                        <button className="btn" type="button" onClick={handleLeave} disabled={Boolean(removingMember) || leaving || transferring || ending}>{leaving ? 'Leaving...' : 'Leave Room'}</button>
                        {isHost && <button className="btn btn-danger" type="button" onClick={handleEndRoom} disabled={Boolean(removingMember) || ending || leaving || transferring}>{ending ? 'Ending...' : 'End Room for Everyone'}</button>}
                    </div>
                </div>
                {leaveError && <p role="alert">{leaveError}</p>}
                {endError && <p role="alert">{endError}</p>}
            </main>
        </PageShell>
    )
}
