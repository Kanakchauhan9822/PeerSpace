// Keep the same audio output across client-side navigation and late peer arrivals.
let context
export function enableRoomAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return null
    try {
        if (!context || context.state === 'closed') context = new AudioContextClass()
        if (context.state === 'suspended') void context.resume().catch(() => {})
        return context
    } catch { return null }
}

export function connectRoomAudio(stream) {
    const output = enableRoomAudio()
    if (!output || !stream.getAudioTracks().length) return null
    try {
        const source = output.createMediaStreamSource(stream)
        source.connect(output.destination)
        return () => source.disconnect()
    } catch { return null }
}
