import { enableRoomAudio } from '../services/roomAudio'
import PageShell from '../../../components/PageShell'
import { useEffect, useState } from 'react'
import { listRooms } from '../services/room.api'
import CreateRooms from '../components/CreateRooms'
import LogoutButton from '../../auth/components/LogoutButton'
import JoinRoom from '../components/JoinRoom'
import { Link, useNavigate } from 'react-router'

export default function Home() {
    const navigate = useNavigate()
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
        <PageShell actions={<LogoutButton />}>
        <main id="main-content" className="page-wrap py-10">
            <div className="mb-10 border-b border-line pb-9">
                <p className="eyebrow mb-4">Your study space</p>
                <h1 className="mb-4 text-4xl font-light sm:text-5xl">Good company. Better focus.</h1>
                <p className="max-w-xl text-muted">Pick up where you left off, or open a fresh room. A little progress starts with showing up.</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">

            <CreateRooms
            onRoomCreated={(room) => {
            navigate(`/rooms/${room._id}`)
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

            </div>
            <div className="mt-12 mb-6 flex items-center justify-between"><h2>Your rooms</h2><span className="badge">{rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}</span></div>

            {loading ? (
                <p role="status" className="panel text-muted">Loading your study rooms...</p>
            ) : error ? (
                <p role="alert">{error}</p>
            ) : rooms.length === 0 ? (
                <div className="panel py-12 text-center"><h3 className="mb-2">Your table is waiting</h3><p className="text-muted">Create your first room above, or join a friend using their room ID.</p></div>
            ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {rooms.map((room) => (
                       <li key={room._id} className="min-w-0">
                            <Link onClick={enableRoomAudio} className="panel group block h-full transition-colors hover:border-[#65696c]" to={`/rooms/${room._id}`}>
                                <span className="eyebrow">Study room</span><h3 className="mt-4 mb-6 break-words">{room.name}</h3><span className="flex items-center justify-between text-sm text-muted"><span>{room.members?.length ?? 1} members</span><span className="text-ink">Open room ↗</span></span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}


        </main>
        </PageShell>
    );
}
