import { useEffect, useState } from 'react';
import { getMe } from './services/auth.api.js';
import { AuthContext } from './auth.context.jsx';



export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;

        async function restoreSession() {
            try {
                const data = await getMe();

                if (active) {
                    setUser(data.user);
                }
            } catch (err) {
                if (active) {
                    setUser(null);

                    if (err.response?.status !== 401) {
                        setError('Unable to check your session. Please reload.');
                    }
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        }

        restoreSession();

        return () => {
            active = false;
        };
    }, []);

    return (
        <AuthContext.Provider value={{ user, setUser, loading, error ,setError}}>
            {children}
        </AuthContext.Provider>
    );
}