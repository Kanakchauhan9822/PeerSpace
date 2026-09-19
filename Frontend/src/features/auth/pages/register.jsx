import { useState } from "react"
import { register } from "../services/auth.api";



export default function Register(){

const [username, setUsername] = useState('');
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
        const data = await register({ username, email, password });
        setMessage(data.message);
        setPassword('');
    } catch (err) {
        setMessage(
            err.response?.data?.message ||
            'Unable to register. Please try again.'
        );
    } finally {
        setLoading(false);
    }
}

    return(
        
        <form onSubmit={
            handleSubmit}>
            <label htmlFor="username">Username</label>
            <input id="username" 
            name="username" 
            type="text" 
            value={username}
            onChange={(e)=>setUsername(e.target.value)}
            required></input>

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
            autoComplete="new-password"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            required></input>

            <button type="submit" disabled={loading}>
                {loading ? 'Registering...' : 'Register'}
            </button>

            <p role="status">{message}</p>
            
            </form>
    )
}