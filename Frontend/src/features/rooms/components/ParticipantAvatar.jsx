export default function ParticipantAvatar({ name, status = 'Camera off' }) {
    return <div className="video-placeholder">
        <span className="participant-avatar" aria-hidden="true">{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span>
        <p className="max-w-full truncate px-3 text-ink">{name}</p>
        <span className="text-xs">{status}</span>
    </div>
}
