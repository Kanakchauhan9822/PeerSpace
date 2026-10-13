import { enableRoomAudio } from '../services/roomAudio'
import { useState } from 'react'
import { createRoom } from '../services/room.api'

export default function CreateRooms({onRoomCreated}) {
    const [name, setName] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')

    async function handleSubmit(e) {
        e.preventDefault()

        if (loading) return

    enableRoomAudio()
        setLoading(true)
        setMessage('')

        try {
            const data = await createRoom({ name })
            onRoomCreated(data.room)
            setMessage(data.message)
            setName('')
        } catch (error) {
            setMessage(
                error.response?.data?.message ||
                'Unable to create room. Please try again.'
            );
        } finally {
            setLoading(false)
        }
    }

    return (
        <form className="room-form panel" onSubmit={handleSubmit}>
            <h2 className="mb-2">Host a study room</h2>
            <p className="!mt-0 mb-6 text-sm text-muted">A place for your next focused session.</p>
            <label htmlFor="room-name">Room name</label>
            <input
                id="room-name"
                name="name"
                type="text" placeholder="e.g. Organic Chemistry revision"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
            />

            <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Room'}
            </button>

            <p role="status">{message}</p>
        </form>
    );
}