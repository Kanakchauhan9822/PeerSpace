// One gallery tile per member, even when that member has several tabs open.
export function galleryMembers({ members, peers, localUserId, cameraEnabled, screenSharing }) {
    const entries = new Map()
    entries.set(localUserId || 'local', { id: localUserId || 'local', name: 'You', local: true, cameraEnabled, screenSharing })
    for (const member of members) {
        if (!member.user?._id || member.user._id === localUserId) continue
        entries.set(member.user._id, { id: member.user._id, name: member.user.username || 'Participant' })
    }
    for (const peer of peers) {
        if (peer.userId === localUserId) continue
        const existing = entries.get(peer.userId) || { id: peer.userId, name: 'Participant' }
        const priority = item => item.screenSharing ? 2 : item.cameraEnabled ? 1 : 0
        if (!existing.socketId || priority(peer) > priority(existing)) {
            entries.set(peer.userId, { ...existing, ...peer })
        }
    }
    return [...entries.values()].sort((a, b) =>
        Number(Boolean(b.screenSharing)) - Number(Boolean(a.screenSharing)) ||
        Number(Boolean(b.cameraEnabled)) - Number(Boolean(a.cameraEnabled))
    )
}
