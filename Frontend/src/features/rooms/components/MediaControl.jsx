export default function MediaControl({ icon, label, active, disabled, onClick }) {
    return (
        <span className="media-control" tabIndex={disabled ? 0 : undefined} aria-label={disabled ? label : undefined}>
            <button type="button" className="media-icon-button" aria-label={label}
                aria-pressed={active} disabled={disabled} onClick={onClick}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {icon === 'screen' && <>
                        <rect x="3" y="3" width="18" height="13" rx="2" />
                        <path d="M8 21h8M12 16v5" />
                        {active ? <rect x="9" y="7" width="6" height="5" /> : <path d="M12 13V6m-3 3 3-3 3 3" />}
                    </>}
                    {icon === 'mic' && <>
                        <rect x="9" y="2" width="6" height="12" rx="3" />
                        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
                    </>}
                    {icon === 'camera' && <>
                        <rect x="2" y="5" width="14" height="14" rx="2" />
                        <path d="m16 10 6-4v12l-6-4" />
                    </>}
                    {!active && icon !== 'screen' && <path d="m2 2 20 20" strokeWidth="2.4" />}
                </svg>
                <span className="sr-only">{label}</span>
            </button>
            <span className="media-control-tooltip" aria-hidden="true">{label}</span>
        </span>
    )
}
