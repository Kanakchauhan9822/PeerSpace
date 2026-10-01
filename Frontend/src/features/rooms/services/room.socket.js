import { io } from 'socket.io-client'

export function createRoomSocket() {
    return io('http://localhost:3000', {
        withCredentials: true,
        autoConnect: false
    })
}