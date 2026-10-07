import { useEffect, useRef, useState } from 'react'

export default function RemoteVideo({ stream, cameraEnabled, screenSharing = false }) {
    const videoRef = useRef(null)
    const [needsPlay, setNeedsPlay] = useState(false)
    const [audioBlocked, setAudioBlocked] = useState(false)

    useEffect(() => {
        const video = videoRef.current
        let active = true

        video.srcObject = stream

        async function startPlayback() {
            video.muted = false
            try {
                await video.play()
                if (active) {
                    setNeedsPlay(false)
                    setAudioBlocked(false)
                }
            } catch (error) {
                if (!active) return
                if (error.name !== 'NotAllowedError') {
                    setNeedsPlay(true)
                    return
                }
                video.muted = true
                setAudioBlocked(true)
                try {
                    await video.play()
                    if (active) setNeedsPlay(false)
                } catch {
                    if (active) setNeedsPlay(true)
                }
            }
        }
        void startPlayback()

        return () => {
            active = false
            video.pause()
            video.srcObject = null
        }
    }, [stream])

    async function handlePlay() {
        try {
            videoRef.current.muted = false
            await videoRef.current.play()
            setNeedsPlay(false)
            setAudioBlocked(false)
        } catch {
            videoRef.current.muted = true
            void videoRef.current.play().catch(() => {})
            setNeedsPlay(true)
        }
    }

    return (
        <div>
            {screenSharing && <p>Shared screen</p>}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{ transform: screenSharing ? 'none' : 'scaleX(-1)',
                display: cameraEnabled || screenSharing ? 'block' : 'none',
                maxWidth: '100%' }}
            />

            {!cameraEnabled && !screenSharing && <p>Camera off</p>}

            {(needsPlay || audioBlocked) && (
                <button type="button" onClick={handlePlay}>
                    {audioBlocked ? 'Enable participant audio' : 'Play participant audio/video'}
                </button>
            )}
        </div>
    )
}
