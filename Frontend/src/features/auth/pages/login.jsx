import { login } from "../services/auth.api";
import { useContext, useState } from 'react';
import { AuthContext } from '../auth.context.jsx';
import { useNavigate } from 'react-router';


export default function Login(){

const navigate = useNavigate();

const { setUser ,setError} = useContext(AuthContext);

const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [loading, setLoading] = useState(false);
const [message, setMessage] = useState('');

async function handleSubmit(e) {
    e.preventDefault();

    if (loading) return;

    setLoading(true);
    setMessage('');

    try {
        const data = await login({  email, password });
        setUser(data.user)
        setError('')
        setMessage(data.message);
        setPassword('');

        navigate('/', { replace: true });
    } catch (err) {
        setMessage(
            err.response?.data?.message ||
            'Unable to Login. Please try again.'
        );
    } finally {
        setLoading(false);
    }
}

    return(
        
        <form onSubmit={
            handleSubmit}>
            
            <label htmlFor="email">Email</label>
            <input id="email" 
            name="email" 
            type="email" 
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            required></input>

            <label htmlFor="password">Password</label>
            <input id="password" 
            name="password" 
            type="password" 
            autoComplete="current-password"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            required></input>

            <button type="submit" disabled={loading}>
                {loading ? 'Logging in...' : 'Login'}
            </button>

            <p role="status">{message}</p>
            
            </form>
    )
}