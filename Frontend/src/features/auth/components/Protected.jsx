import { useContext } from 'react';
import { Navigate } from 'react-router';
import { AuthContext } from '../auth.context.jsx';

export default function Protected({ children }) {
    const { user, loading, error } = useContext(AuthContext);

    if (loading) {
        return <p>Checking your session...</p>;
    }

    if (error) {
        return <p role="alert">{error}</p>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    return children;
}