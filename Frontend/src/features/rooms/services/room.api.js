import axios from "axios"

const api=axios.create({
    baseURL:"http://localhost:3000",
    withCredentials:true
})

export async function createRoom({name}){
    const response=await api.post('/api/rooms',{
                    name
        })
        return response.data;
}

export async function listRooms(){
    const response = await api.get('/api/rooms')
    return response.data
}

export async function joinRoom({ roomId }) {
    const response = await api.post(`/api/rooms/${encodeURIComponent(roomId)}/join`
    );

    return response.data;
}

export async function getRoom({roomId}){
    const response=await api.get(`/api/rooms/${encodeURIComponent(roomId)}`)
    
    return response.data
}

export async function leaveRoom({ roomId }) {
    const response = await api.post(
        `/api/rooms/${encodeURIComponent(roomId)}/leave`
    );

    return response.data;
}