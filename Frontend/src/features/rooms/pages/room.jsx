import { useEffect, useState ,useContext} from 'react'
import { useNavigate, useParams } from 'react-router'
import { getRoom, leaveRoom } from '../services/room.api'
import { AuthContext } from '../../auth/auth.context.jsx'
import { getRoom, leaveRoom, transferHost } from '../services/room.api'


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


async function handleLeave() {
    if (leaving) return;

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
                if (active) {
                    setError(
                        err.response?.data?.message ||
                        'Unable to load room. Please try again.'
                    )
                }
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
    }, [roomId])

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
                    {member.user?.username ??'Unknown user'}</li>
                ))}
            </ul>
            <button type="button" onClick={handleLeave} disabled={leaving}>
                {leaving ? 'Leaving...' : 'Leave Room'}
            </button>

            {leaveError && <p role="alert">{leaveError}</p>}
        </main>
    );
}