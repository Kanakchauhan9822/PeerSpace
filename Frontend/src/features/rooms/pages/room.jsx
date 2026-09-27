import { useEffect, useState ,useContext} from 'react'
import { useNavigate, useParams } from 'react-router'
import { AuthContext } from '../../auth/auth.context.jsx'
import { getRoom, leaveRoom, transferHost,endRoom } from '../services/room.api'


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
    const [transferring, setTransferring] = useState(false);
    const [transferMessage, setTransferMessage] = useState('');
    const [ending, setEnding] = useState(false);
    const [endError, setEndError] = useState('');

    async function handleLeave() {
    if (leaving||transferring||ending) return;

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
    if (transferring || leaving ||ending|| !isHost) return;

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
    }, [roomId,navigate])

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
            <p>Room ID: {room._id}</p>
            <p>Host: {room.host?.username ?? 'Unknown user'}</p>
            {isHost && <p>You are the host.</p>}
            <h2>Members</h2>
            <ul>
                {room.members.map((member) => (
                    <li key={member._id}>
                    {member.user?.username ?? 'Unknown user'}

                    {isHost && member.user && member.user._id !== user._id && (
                            <button
                    type="button"
                    onClick={() => handleTransferHost(member.user._id)}
                    disabled={transferring || leaving||ending}
                        >
                    Make Host
                        </button>
                        )}
                         </li>
                      ))}
                    </ul>

                    <p role="status">{transferMessage}</p>
            <button type="button" onClick={handleLeave} 
                                  disabled={leaving || transferring||ending}>
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