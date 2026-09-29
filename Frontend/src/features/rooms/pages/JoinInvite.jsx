import { joinRoom, getRoom } from '../services/room.api'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'


export default function JoinInvite() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const autoJoinStarted = useRef(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

  const handleJoin=useCallback(async()=> {
    if (joining) return

    setJoining(true)
    setError('')

    try {
      try {
       
        await getRoom({ roomId })
      } catch (err) {
        
        if (err.response?.status !== 403) throw err

        try {
          await joinRoom({ roomId })
        } catch (joinError) {
          if (joinError.response?.status !== 409) throw joinError

      
          await getRoom({ roomId })
        }
      }

      navigate(`/rooms/${roomId}`, { replace: true })
    } catch (err) {
      if (err.response?.status === 401) {
        navigate('/login', {
          replace: true,
          state: { from: `/join/${roomId}` }
        })
        return
      }

      setError(
        err.response?.data?.message ||
        'Unable to join the room. Please try again.'
      )
    } finally {
      setJoining(false)
    }
  },[joining,roomId,navigate])
  useEffect(() => {
    if (!location.state?.autoJoin || autoJoinStarted.current) return

    autoJoinStarted.current = true
    void handleJoin()
  }, [location.state?.autoJoin, handleJoin])



  return (
    <main>
      <h1>Room invitation</h1>
      <p>You have been invited to join a PeerSpace room.</p>
      <p>Room ID: {roomId}</p>

      <button
        type="button"
        onClick={handleJoin}
        disabled={joining}
      >
        {joining ? 'Joining...' : 'Join Room'}
      </button>

      {error && <p role="alert">{error}</p>}

      <p>
        <Link to="/">Back to home</Link>
      </p>
    </main>
  )
}