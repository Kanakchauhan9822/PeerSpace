import { useEffect, useState } from 'react'
import { listRooms } from '../services/room.api'
import CreateRooms from '../components/CreateRooms'
import LogoutButton from '../../auth/components/LogoutButton'
import JoinRoom from '../components/JoinRoom'
import { Link } from 'react-router'

export default function Home() {
    const [rooms, setRooms] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        let active = true

        async function loadRooms() {
            try {
                const data = await listRooms()

                if (active) {
                    setRooms(data.rooms);
                }
            } catch (err) {
                if (active) {
                    setError(
                        err.response?.data?.message ||
                        'Unable to load rooms. Please try again.'
                    );
                }
            } finally {
                if (active) {
                    setLoading(false)
                }
            }
        }

        loadRooms()

        return () => {
            active = false
        }
    }, [])

    return (
        <main>
            <h1>PeerSpace</h1>

            <CreateRooms
            onRoomCreated={(room) => {
            setRooms((previous) => [room, ...previous]);
    }}
/>
            <JoinRoom
            onRoomJoined={(room) => {
            setRooms((previous) =>
            [
                room,
                ...previous.filter((item) => item._id !== room._id),
            ].sort(
                (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
            )
        );
    }}
/>

            <h2>Your rooms</h2>

            {loading ? (
                <p>Loading rooms...</p>
            ) : error ? (
                <p role="alert">{error}</p>
            ) : rooms.length === 0 ? (
                <p>You haven’t joined any rooms yet.</p>
            ) : (
                <ul>
                    {rooms.map((room) => (
                       <li key={room._id}>
                            <Link to={`/rooms/${room._id}`}>
                                {room.name}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}

            <LogoutButton />
        </main>
    );
}