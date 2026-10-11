import { useContext } from 'react';
import { Navigate,useLocation } from 'react-router';
import { AuthContext } from '../auth.context.jsx';
import PageShell from '../../../components/PageShell'

export default function Protected({ children }) {
    const { user, loading, error } = useContext(AuthContext);
    const location = useLocation();
    if (loading) {
        return <PageShell><main id="main-content" className="page-wrap py-16"><p role="status" className="panel text-muted">Checking your session...</p></main></PageShell>
    }

    if (error) {
        return <PageShell><main id="main-content" className="page-wrap py-16"><p role="alert">{error}</p><button className="btn" onClick={() => window.location.reload()}>Retry</button></main></PageShell>
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
