import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { getRoom } from '../services/room.api';

export default function Room() {
    const { roomId } = useParams();
    const [room, setRoom] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;

        async function loadRoom() {
            setLoading(true);
            setError('');
            setRoom(null);

            try {
                const data = await getRoom({ roomId });

                if (active) {
                    setRoom(data.room);
                }
            } catch (err) {
                if (active) {
                    setError(
                        err.response?.data?.message ||
                        'Unable to load room. Please try again.'
                    );
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        }

        loadRoom();

        return () => {
            active = false;
        };
    }, [roomId]);

    if (loading) {
        return <p>Loading room...</p>;
    }

    if (error) {
        return <p role="alert">{error}</p>;
    }

    if (!room) {
        return <p>Room not found.</p>;
    }

    return (
        <main>
            <h1>{room.name}</h1>
            <p>Room ID: {room._id}</p>
            <p>Host: {room.host?.username ?? 'Unknown user'}</p>

            <h2>Members</h2>
            <ul>
                {room.members.map((member) => (
                    <li key={member._id}>
                    {member.user?.username ??'Unknown user'}</li>
                ))}
            </ul>
        </main>
    );
}