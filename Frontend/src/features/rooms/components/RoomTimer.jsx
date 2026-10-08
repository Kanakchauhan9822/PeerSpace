import { useEffect, useState } from 'react'

function TimerControls({ timer, busy, onAction, running, label }) {
    const [value, setValue] = useState(String((timer?.durationSeconds ?? 1500) / 60))
    const idle = (timer?.status ?? 'idle') === 'idle'

    function submit(event) {
        event.preventDefault()
        if (busy) return
        if (idle) {
            const minutes = Number(value)
            if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) return
            onAction('start', minutes)
        } else {
            onAction(running ? 'pause' : 'start')
        }
    }

    return (
        <form onSubmit={submit}>
            {idle && <label>
                Duration (minutes){' '}
                <input type="number" min="1" max="180" step="1" required
                    value={value} disabled={busy || !idle}
                    onChange={event => setValue(event.target.value)} />
            </label>}
            <button type="submit" disabled={busy}>{busy ? 'Updating...' : label}</button>
            <button type="button" disabled={busy} onClick={() => onAction('reset')}>Reset</button>
        </form>
    )
}

export default function RoomTimer({ timer, isHost, busy, onAction }) {
    const [now, setNow] = useState(Date.now)

    useEffect(() => {
        const interval = setInterval(() => {
            setNow(Date.now())
        }, 250)

        return () => clearInterval(interval)
    }, [])

    const remainingSeconds = timer?.status === 'running' && timer.endsAt
        ? Math.max(
            0,
            Math.ceil((new Date(timer.endsAt).getTime() - now) / 1000)
        )
        : Math.ceil(timer?.remainingSeconds ?? 25 * 60)

    const running = timer?.status === 'running' && remainingSeconds > 0
    const label = running ? 'Pause' : timer?.status === 'paused' && remainingSeconds > 0 ? 'Resume' : 'Start'

    const minutes = Math.floor(remainingSeconds / 60)
    const seconds = remainingSeconds % 60

    return (
        <section>
            <h2>Study timer</h2>
            <p>
                {String(minutes).padStart(2, '0')}:
                {String(seconds).padStart(2, '0')}
            </p>
            <p>
                {remainingSeconds === 0
                    ? 'Session complete'
                    : timer?.status ?? 'idle'}
            </p>
            {isHost && (
                <TimerControls
                    key={String(timer?.durationSeconds ?? 1500) + ':' + (timer?.status ?? 'idle')}
                    timer={timer} busy={busy} onAction={onAction} running={running} label={label} />

            )}
        </section>
    )
}
