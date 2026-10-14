import AuthLayout from '../../../components/AuthLayout'
import { useContext, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { AuthContext } from '../auth.context.jsx'
import { register } from "../services/auth.api"

export default function Register(){

const [username, setUsername] = useState('');
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [loading, setLoading] = useState(false);
const [message, setMessage] = useState('');
const location = useLocation()
const navigate = useNavigate()
const { setUser, setError } = useContext(AuthContext)

async function handleSubmit(e) {
    e.preventDefault();

    if (loading) return;

    setLoading(true);
    setMessage('');

    try {
        const data = await register({ username, email, password });

        setUser(data.user)
        setError('')
        setPassword('')

        navigate(location.state?.from ||'/',{
            replace:true,
            state:{autoJoin:true}
        })

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

        <AuthLayout register>
        <form
        onSubmit={
            handleSubmit}>
            <label htmlFor="username">Username</label>
            <input id="username"
            maxLength={50} name="username" autoComplete="username" placeholder="Your name"
            type="text"
            value={username}
            onChange={(e)=>setUsername(e.target.value)}
            required></input>

            <label htmlFor="email">Email</label>
            <input id="email"
            name="email" autoComplete="email" placeholder="you@college.edu"
            type="email" maxLength={254}
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            required></input>

            <label htmlFor="password">Password</label>
            <input id="password"
            name="password"
            type="password"
            autoComplete="new-password" minLength={8}
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            required></input>

            <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Registering...' : 'Register'}
            </button>

            <p role="status">{message}</p>

                <p>
            <Link to="/login" state={{ from: location.state?.from }}>
            Log in
            </Link>
                </p>
            </form>
        </AuthLayout>
  )
}