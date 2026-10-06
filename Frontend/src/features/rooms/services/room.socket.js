import { io } from 'socket.io-client'

export function createRoomSocket() {
    return io({
        withCredentials: true,
        autoConnect: false
    })
}
