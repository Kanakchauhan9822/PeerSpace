import { Link } from 'react-router'
import PageShell from './PageShell'

const features = [
    ['Host your own room', 'Create a room, name it after your subject and choose how long you want to focus.'],
    ['Invite your study mates', 'Share a room link. Friends can log in or register and join from their browser.'],
    ['Shared study timer', 'Start, pause and resume a focus session together. One countdown for the whole group.'],
    ['Video and voice', 'See each other studying or keep cameras off. You decide when to turn on your microphone.'],
    ['Room chat', 'Post your goal for the session, share a link or ask a quick question without interrupting anyone.'],
    ['Share your screen', 'Walk through a problem, compare notes or explain a concept with your screen in the room.']
]

export default function AuthLayout({ children, register = false }) {
    return (
        <PageShell landing={!register} actions={register && <Link to="/login" className="btn">Log in</Link>}>
            <main id="main-content">
                <section className="page-wrap relative grid grid-cols-1 items-center gap-10 pt-12 pb-20 lg:grid-cols-2 lg:gap-[72px] lg:pt-16 lg:pb-28">
                    <div aria-hidden="true" className="pointer-events-none absolute top-0 right-0 left-3 overflow-hidden select-none font-serif text-[150px] leading-none font-light tracking-tight text-transparent sm:text-[250px] lg:text-[300px]" style={{ WebkitTextStroke: '1px #26292b' }}>25:00</div>
                    <div className="relative">
                        <div className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-line bg-panel px-4 py-2 text-sm text-[#b4b7b9]"><span className="size-2 rounded-full bg-ink" />A little focus. Better together.</div>
                        <h1 className="mb-6 font-serif text-[42px] leading-[1.08] font-light tracking-[-.025em] sm:text-[60px]">{register ? 'Your next good study session starts here.' : 'Open a room. Sit down together. Get the work done.'}</h1>
                        <p className="mb-4 max-w-[30em] text-lg text-muted">PeerSpace is a video study room for students. Host one, send the link to your study mates and share one study timer, so everyone focuses together.</p>
                        <p className="text-[15px] text-[#8a8d90]">Free for students. Runs in your browser.</p>
                    </div>
                    <div id="start" className="auth-card relative scroll-mt-6">
                        <h2 className="mb-1 text-[28px]">{register ? 'Create your account' : 'Welcome back'}</h2>
                        <p className="mb-7 text-[15px] text-[#a3a6a9]">{register ? 'Find your focus, with a little company.' : 'Log in to join or host a study room.'}</p>
                        {children}
                    </div>
                </section>
                {!register && <>
                    <section id="room" className="page-wrap scroll-mt-8 pb-20 lg:pb-28">
                        <div className="grid grid-cols-1 items-center gap-10 rounded-3xl border border-[#2c2f31] bg-panel p-7 sm:p-12 lg:grid-cols-2 lg:gap-14 lg:py-14">
                            <div>
                                <h2 className="mb-[18px] text-[34px] leading-[1.15] font-light tracking-tight sm:text-[40px]">One timer for the whole table</h2>
                                <p className="mb-3.5 max-w-[30em] text-muted">The host starts a focus block and every screen counts down together. Take a break when you need one, share a thought in chat, then get back to your books.</p>
                                <p className="text-muted">Nobody has to say “five more minutes” again.</p>
                                <div className="mt-8 grid max-w-[340px] grid-cols-2 gap-2.5" aria-label="Example study room">
                                    {['Aarav', 'Riya', 'Meher', 'You'].map((name, i) => <div key={name} className={`relative aspect-[16/10] rounded-xl border border-[#34373a] ${i % 3 ? 'bg-[#2b2d2f]' : 'bg-[#26282a]'}`}><span className="absolute bottom-2 left-2.5 text-[13px] text-[#b4b7b9]">{name}</span></div>)}
                                </div>
                            </div>
                            <div className="text-center">
                                <div className="relative mx-auto w-[300px] max-w-full">
                                    <svg viewBox="0 0 200 200" className="w-full -rotate-90" aria-hidden="true"><circle cx="100" cy="100" r="90" fill="none" stroke="#2c2f31" strokeWidth="6" /><circle cx="100" cy="100" r="90" fill="none" stroke="#e8e9ea" strokeWidth="6" strokeLinecap="round" strokeDasharray="565" strokeDashoffset="424" /></svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center"><div className="font-serif text-[64px] leading-none font-light tabular-nums">18:42</div><div className="mt-2 text-sm text-muted">Shared focus session</div></div>
                                </div>
                                <p className="mt-6 text-sm text-muted">Organic Chemistry revision · Room preview</p>
                            </div>
                        </div>
                    </section>
                    <section id="features" className="page-wrap scroll-mt-8 pb-24">
                        <h2 className="mb-10 text-[34px] leading-tight font-light sm:text-[40px]">What you get in every room</h2>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {features.map(([title, text], i) => <article key={title} className="rounded-2xl border border-[#2c2f31] bg-panel p-7">
                                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    {i === 2 ? <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 3h6" /></> : i === 4 ? <path d="M4 5h16v11H9l-5 4z" /> : i === 1 ? <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></> : <><rect x="3" y="5" width="16" height="13" rx="2" /><path d={i === 0 ? 'M11 8v7M8 11.5h6' : i === 3 ? 'M19 10l3-2v8l-3-2' : 'M8 22h6M11 18v4'} /></>}
                                </svg>
                                <h3 className="mt-4 mb-1.5">{title}</h3><p className="text-[15px] text-muted">{text}</p>
                            </article>)}
                        </div>
                    </section>
                    <section className="page-wrap pb-4"><div className="flex flex-wrap items-center justify-between gap-7 rounded-3xl border border-line bg-panel px-7 py-10 sm:px-11 sm:py-[52px]"><h2 className="max-w-[16em] text-[32px] leading-[1.2] font-light">Your exam is not going to wait. Neither should your study group.</h2><Link to="/register" className="btn btn-primary rounded-full px-[30px] py-[15px]">Register and host a room</Link></div></section>
                </>}
            </main>
        </PageShell>
    )
}
