import { test } from 'node:test'
import assert from 'node:assert/strict'
import { galleryMembers } from '../src/features/rooms/services/gallery.js'

test('gallery includes all members, prioritizes video and deduplicates tabs', () => {
    const members = ['host', 'a', 'b', 'c', 'd'].map(id => ({ user: { _id: id, username: id } }))
    const result = galleryMembers({ members, localUserId: 'host', cameraEnabled: false, screenSharing: false,
        peers: [
            { userId: 'a', socketId: 'a-off', cameraEnabled: false },
            { userId: 'a', socketId: 'a-on', cameraEnabled: true },
            { userId: 'b', socketId: 'b-screen', screenSharing: true },
            { userId: 'host', socketId: 'another-local-tab', cameraEnabled: true }
        ] })
    assert.equal(result.length, 5)
    assert.deepEqual(result.slice(0, 2).map(member => member.id), ['b', 'a'])
    assert.equal(result[1].socketId, 'a-on')
    assert.equal(result.filter(member => member.local).length, 1)
    assert.ok(result.some(member => member.id === 'd' && !member.socketId))
})

test('disconnected members remain as name tiles and local video stays first when active', () => {
    const result = galleryMembers({ members: [{ user: { _id: 'a', username: 'A' } }], peers: [],
        localUserId: 'host', cameraEnabled: true, screenSharing: false })
    assert.equal(result[0].local, true)
    assert.equal(result[1].name, 'A')
})
