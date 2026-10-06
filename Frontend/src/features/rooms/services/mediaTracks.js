// Keep the shared stream authoritative so participants joining during a switch
// receive the same video source as existing participants.
export async function replaceVideoTrack(stream, connections, nextTrack) {
    const previous = stream.getVideoTracks()
    previous.forEach(track => stream.removeTrack(track))
    if (nextTrack) stream.addTrack(nextTrack)

    async function updateSenders(track) {
        return Promise.allSettled([...connections.values()].map(async entry => {
            if (!entry.videoSender || entry.pc.signalingState === 'closed') return
            try {
                await entry.videoSender.replaceTrack(track)
            } catch (error) {
                if (entry.pc.signalingState !== 'closed') throw error
            }
        }))
    }

    const results = await updateSenders(nextTrack)
    const failure = results.find(result => result.status === 'rejected')
    if (failure) {
        if (nextTrack) stream.removeTrack(nextTrack)
        previous.filter(track => track.readyState === 'live').forEach(track => stream.addTrack(track))
        await updateSenders(stream.getVideoTracks()[0] || null)
        throw failure.reason
    }
}
