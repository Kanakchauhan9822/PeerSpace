import { Link } from 'react-router'

export default function PageShell({ children, actions, landing = false }) {
    return (
        <>
            <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:p-3 focus:text-canvas">Skip to content</a>
            <header className="page-wrap flex flex-wrap items-center justify-between gap-4 py-6">
                <Link to="/" className="font-serif text-2xl font-medium">PeerSpace</Link>
                {landing ? (
                    <nav aria-label="Main navigation" className="flex gap-1.5 rounded-full border border-line bg-panel p-1.5 text-sm">
                        <a className="rounded-full px-3 py-2 text-[#b4b7b9] hover:text-white sm:px-[18px]" href="#room">Inside a room</a>
                        <a className="rounded-full px-3 py-2 text-[#b4b7b9] hover:text-white sm:px-[18px]" href="#features">Features</a>
                        <a className="rounded-full bg-ink px-4 py-2 font-semibold text-canvas" href="#start">Log in</a>
                    </nav>
                ) : <div className="flex flex-wrap items-center gap-3 text-sm">{actions || <Link className="btn" to="/">Your rooms <span aria-hidden="true">↗</span></Link>}</div>}
            </header>
            {children}
            <footer className="page-wrap mt-14 flex flex-wrap justify-between gap-3 border-t border-line py-8 text-sm text-muted">
                <span className="font-serif">PeerSpace</span><span>Made by students, for students.</span>
            </footer>
        </>
    )
}
