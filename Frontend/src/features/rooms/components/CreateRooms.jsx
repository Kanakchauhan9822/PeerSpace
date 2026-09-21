import { useState } from 'react'
import { createRoom } from '../services/room.api'

export default function CreateRooms() {
    const [name, setName] = useState('')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')

    async function handleSubmit(e) {
        e.preventDefault()

        if (loading) return

        setLoading(true)
        setMessage('')

        try {
            const data = await createRoom({ name })
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
        <form onSubmit={handleSubmit}>
            <label htmlFor="room-name">Room name</label>
            <input
                id="room-name"
                name="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
            />

            <button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Room'}
            </button>

            <p role="status">{message}</p>
        </form>
    );
}