import { useContext } from 'react';
import { Navigate,useLocation } from 'react-router';
import { AuthContext } from '../auth.context.jsx';

export default function Protected({ children }) {
    const { user, loading, error } = useContext(AuthContext);
    const location = useLocation();
    if (loading) {
        return <p>Checking your session...</p>;
    }

    if (error) {
        return <p role="alert">{error}</p>;
    }

    if (!user) {
        return (
            <Navigate
                to="/login"
                replace
                state={{ from: location.pathname }}
                />
            );
    }

    return children;
}