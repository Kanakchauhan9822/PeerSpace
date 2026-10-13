import { useEffect, useState } from 'react'

// Detect microphone activity locally without recording or playing the source.
export default function SpeakingIndicator({ stream, enabled = true }) {
    const [speaking, setSpeaking] = useState(false)
    useEffect(() => {
        if (!stream || !enabled) return
        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        if (!AudioContextClass) return
        let context
        let source
        let analyser
        let lastVoice = 0
        let previous = false
        function connect() {
            source?.disconnect()
            source = null
            const tracks = stream.getAudioTracks().filter(track => track.readyState === 'live')
            if (!tracks.length) return
            try {
                context ||= new AudioContextClass()
                analyser ||= context.createAnalyser()
                analyser.fftSize = 512
                source = context.createMediaStreamSource(new MediaStream(tracks))
                source.connect(analyser)
                // No destination connection: local microphone must never echo.
            } catch { source = null }
        }
        function resume() {
            if (context?.state === 'suspended') void context.resume().catch(() => {})
        }
        connect()
        stream.addEventListener('addtrack', connect)
        stream.addEventListener('removetrack', connect)
        document.addEventListener('click', resume)
        document.addEventListener('keydown', resume)
        const samples = new Float32Array(512)
        const timer = setInterval(() => {
            const live = source && context?.state === 'running' && stream.getAudioTracks().some(track => track.enabled && !track.muted && track.readyState === 'live')
            if (live) {
                analyser.getFloatTimeDomainData(samples)
                const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length)
                if (rms > 0.025) lastVoice = performance.now()
            }
            const next = Boolean(live && lastVoice > 0 && performance.now() - lastVoice < 300)
            if (next !== previous) {
                previous = next
                setSpeaking(next)
            }
        }, 80)
        return () => {
            clearInterval(timer)
            stream.removeEventListener('addtrack', connect)
            stream.removeEventListener('removetrack', connect)
            document.removeEventListener('click', resume)
            document.removeEventListener('keydown', resume)
            source?.disconnect()
            analyser?.disconnect()
            if (context) void context.close().catch(() => {})
        }
    }, [stream, enabled])

    if (!enabled || !speaking) return null
    return <span className="ml-2 inline-flex align-middle text-green-400" title="Speaking" role="img" aria-label="Speaking">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
        </svg>
    </span>
}
