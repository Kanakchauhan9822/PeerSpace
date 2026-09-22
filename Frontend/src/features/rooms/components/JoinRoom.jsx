import { useState } from 'react';
import { joinRoom } from '../services/room.api';

export default function JoinRoom({ onRoomJoined }) {
    const [roomId, setRoomId] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    async function handleSubmit(event) {
        event.preventDefault();

        if (loading) return;

        const trimmedId = roomId.trim();

        if (!trimmedId) {
            setMessage('Please enter a room ID.');
            return;
        }

        setLoading(true);
        setMessage('');

        try {
            const data = await joinRoom({ roomId: trimmedId });
            onRoomJoined(data.room);
            setMessage(data.message);
            setRoomId('');
        } catch (error) {
            setMessage(
                error.response?.data?.message ||
                'Unable to join room. Please try again.'
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <form onSubmit={handleSubmit}>
            <label htmlFor="join-room-id">Room ID</label>
            <input
                id="join-room-id"
                name="roomId"
                type="text"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                required
            />

            <button type="submit" disabled={loading}>
                {loading ? 'Joining...' : 'Join Room'}
            </button>

            <p role="status">{message}</p>
        </form>
    );
}