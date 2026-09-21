import {createBrowserRouter} from 'react-router'
import Register from './features/auth/pages/register'
import Login from './features/auth/pages/login'
import Protected from './features/auth/components/Protected';
import LogoutButton from './features/auth/components/LogoutButton';


export const router=createBrowserRouter([
    {
        path:'/',
        element: (
            <Protected>
            <h1>PeerSpace</h1>
            <LogoutButton/>
            </Protected>
    ),
    },{
        path:'/login',
        element:<Login />
    },
    {
        path:'/register',
        element:<Register/>
    },

])