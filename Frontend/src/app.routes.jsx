import {createBrowserRouter} from 'react-router'
import Register from './features/auth/pages/register'
import Login from './features/auth/pages/login'
import Protected from './features/auth/components/Protected';
import Home from './features/rooms/pages/Home'

export const router=createBrowserRouter([
    {
        path:'/',
        element: (
            <Protected>
                <Home/>    
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