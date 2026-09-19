import axios from "axios"

const api=axios.create({
    baseURL:"http://localhost:3000"
})

export async function register(
    {username,email,password}){
        const response=await api.post('/api/auth/register',{
            username,
            email,
            password
        })
        return response.data;
    }