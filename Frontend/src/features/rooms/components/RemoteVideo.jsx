import { enableRoomAudio, connectRoomAudio } from '../services/roomAudio'
import { useEffect, useRef, useState } from 'react'
import ParticipantAvatar from './ParticipantAvatar'
import SpeakingIndicator from './SpeakingIndicator'

export default function RemoteVideo({ stream, cameraEnabled, screenSharing = false, name = 'Participant', tileStyle }) {
    const videoRef = useRef(null)
    const audioRef = useRef(null)
    const [needsPlay, setNeedsPlay] = useState(false)

    useEffect(() => {
        const video = videoRef.current
        const audio = audioRef.current
        const picture = new MediaStream()
        const sound = new MediaStream()
        let active = true
        let disconnectAudio
        let audioTrackIds = ''

        video.muted = true
        video.srcObject = picture
        audio.srcObject = sound

        async function playAudio() {
            if (!sound.getAudioTracks().length) return
            try {
                await audio.play()
            } catch {
                // Retry silently when tracks or user interaction allow playback.
            }
        }
        async function playVideo() {
            if (!picture.getVideoTracks().length) return
            try {
                await video.play()
                if (active) setNeedsPlay(false)
            } catch {
                if (active) setNeedsPlay(true)
            }
        }
        function synchronize() {
            for (const target of [picture, sound]) {
                target.getTracks().forEach(track => {
                    if (!stream?.getTracks().includes(track)) target.removeTrack(track)
                })
            }
            stream?.getTracks().forEach(track => {
                const target = track.kind === 'audio' ? sound : picture
                if (!target.getTracks().includes(track)) target.addTrack(track)
                track.removeEventListener('unmute', retry)
                track.addEventListener('unmute', retry)
            })
            const ids = sound.getAudioTracks().map(track => track.id).join(',')
            if (ids !== audioTrackIds) {
                disconnectAudio?.()
                disconnectAudio = connectRoomAudio(sound)
                audioTrackIds = ids
                // The shared output plays audio; keep the fallback element silent.
                audio.muted = Boolean(disconnectAudio)
            }
            retry()
        }
        function retry() {
            enableRoomAudio()
            void playAudio()
            void playVideo()
        }
        synchronize()
        stream?.addEventListener('addtrack', synchronize)
        stream?.addEventListener('removetrack', synchronize)
        document.addEventListener('click', retry)
        document.addEventListener('keydown', retry)
        return () => {
            active = false
            disconnectAudio?.()
            stream?.removeEventListener('addtrack', synchronize)
            stream?.removeEventListener('removetrack', synchronize)
            stream?.getTracks().forEach(track => track.removeEventListener('unmute', retry))
            document.removeEventListener('click', retry)
            document.removeEventListener('keydown', retry)
            video.pause()
            audio.pause()
            video.srcObject = null
            audio.srcObject = null
        }
    }, [stream])

    return (
        <div className="video-tile" style={tileStyle}>
            <span className="video-label">{name}{screenSharing ? ' / Shared screen' : ''}{!screenSharing && <SpeakingIndicator stream={stream} />}</span>
            <audio ref={audioRef} autoPlay />
            <video ref={videoRef} autoPlay muted playsInline
                style={{ transform: screenSharing ? 'none' : 'scaleX(-1)',
                    display: cameraEnabled || screenSharing ? 'block' : 'none', maxWidth: '100%' }} />
            {!cameraEnabled && !screenSharing && <ParticipantAvatar name={name} />}
            {needsPlay && <button className="btn absolute top-12 left-2 !text-xs" type="button" title="Play participant video">
                Play video
            </button>}
        </div>
    )
}
