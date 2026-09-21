import { useContext, useState } from 'react'
import { AuthContext } from '../auth.context.jsx'
import { logout } from '../services/auth.api'

export default function LogoutButton() {
    const { setUser, setError } = useContext(AuthContext)
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState('')

    async function handleLogout() {
        if (loading) return

        setLoading(true)
        setMessage('')

        try {
            await logout()
            setError('')
            setUser(null)
        } catch (error) {
            setMessage(
                error.response?.data?.message ||
                'Unable to log out. Please try again.'
            );
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={handleLogout}
                disabled={loading}
            >
                {loading ? 'Logging out...' : 'Logout'}
            </button>

            <p role="status">{message}</p>
        </>
    );
}