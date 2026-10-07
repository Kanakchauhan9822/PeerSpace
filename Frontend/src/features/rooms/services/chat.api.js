import axios from 'axios'

const api = axios.create({ baseURL: '/', withCredentials: true, timeout: 15000 })

export async function listMessages({ roomId, before, signal }) {
    const response = await api.get(`/api/rooms/${encodeURIComponent(roomId)}/messages`, {
        params: before ? { before } : undefined,
        signal
    })
    return response.data
}

export async function sendMessage({ roomId, text, clientMessageId }) {
    const response = await api.post(`/api/rooms/${encodeURIComponent(roomId)}/messages`, { text, clientMessageId })
    return response.data
}
