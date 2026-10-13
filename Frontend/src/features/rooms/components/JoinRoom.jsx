import { enableRoomAudio } from '../services/roomAudio'
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

    enableRoomAudio()
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
        <form className="room-form panel" onSubmit={handleSubmit}>
            <h2 className="mb-2">Join your study mates</h2>
            <p className="!mt-0 mb-6 text-sm text-muted">Have an invitation? Enter the room ID.</p>
            <label htmlFor="join-room-id">Room ID</label>
            <input
                id="join-room-id"
                name="roomId"
                type="text" placeholder="Paste a room ID"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                required
            />

            <button className="btn " type="submit" disabled={loading}>
                {loading ? 'Joining...' : 'Join Room'}
            </button>

            <p role="status">{message}</p>
        </form>
    );
}