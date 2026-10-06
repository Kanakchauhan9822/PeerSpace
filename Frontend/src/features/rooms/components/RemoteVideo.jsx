import { useEffect, useRef, useState } from 'react'

export default function RemoteVideo({ stream, cameraEnabled, screenSharing = false }) {
    const videoRef = useRef(null)
    const [needsPlay, setNeedsPlay] = useState(false)

    useEffect(() => {
        const video = videoRef.current
        let active = true

        video.srcObject = stream

        video.play().catch(() => {
            if (active) setNeedsPlay(true)
        })

        return () => {
            active = false
            video.pause()
            video.srcObject = null
        }
    }, [stream])

    async function handlePlay() {
        try {
            await videoRef.current.play()
            setNeedsPlay(false)
        } catch {
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

            {needsPlay && (
                <button type="button" onClick={handlePlay}>
                    Play participant audio/video
                </button>
            )}
        </div>
    )
}
