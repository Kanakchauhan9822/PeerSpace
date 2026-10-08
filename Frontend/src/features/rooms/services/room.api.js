import axios from "axios"

const api=axios.create({
    baseURL:'/',
    withCredentials:true
})

export async function createRoom({name}){
    const response=await api.post('/api/rooms',{
                    name
        })
        return response.data
}

export async function listRooms(){
    const response = await api.get('/api/rooms')
    return response.data
}

export async function joinRoom({ roomId }) {
    const response = await api.post(`/api/rooms/${encodeURIComponent(roomId)}/join`
    );

    return response.data
}

export async function getRoom({roomId}){
    const response=await api.get(`/api/rooms/${encodeURIComponent(roomId)}`)
    
    return response.data
}

export async function leaveRoom({ roomId }) {
    const response = await api.post(
        `/api/rooms/${encodeURIComponent(roomId)}/leave`
    )

    return response.data;
}

export async function transferHost({ roomId, newHostId }) {
    const response = await api.post(
        `/api/rooms/${encodeURIComponent(roomId)}/transfer-host`,
        { newHostId }
    )

    return response.data;
}

export async function endRoom({ roomId }) {
    const response = await api.post(
        `/api/rooms/${encodeURIComponent(roomId)}/end`
    )

    return response.data;
}

export async function getRoomIceServers({ roomId }) {
    const response = await api.get(
        `/api/rooms/${encodeURIComponent(roomId)}/ice-servers`
    )

    return response.data
}

export async function startTimer({ roomId, minutes }) {
    const response = await api.post(
        `/api/rooms/${encodeURIComponent(roomId)}/timer/start`,
        { minutes }
    )

    return response.data
}

export async function pauseTimer({ roomId }) {
    const response = await api.post(`/api/rooms/${encodeURIComponent(roomId)}/timer/pause`)
    return response.data
}

export async function resetTimer({ roomId }) {
    const response = await api.post(`/api/rooms/${encodeURIComponent(roomId)}/timer/reset`)
    return response.data
}

export async function setTimerDuration({ roomId, minutes }) {
    const response = await api.post('/api/rooms/' + encodeURIComponent(roomId) + '/timer/duration', { minutes })
    return response.data
}
