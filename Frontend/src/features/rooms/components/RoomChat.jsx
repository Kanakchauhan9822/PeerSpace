import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { listMessages, sendMessage } from '../services/chat.api'
import './RoomChat.css'

function mergeMessages(previous, incoming) {
    const byId = new Map(previous.map(message => [message._id, message]))
    incoming.forEach(message => byId.set(message._id, message))
    return [...byId.values()].sort((a, b) => a._id.localeCompare(b._id))
}

export default function RoomChat({ roomId, socket, userId }) {
    const [messages, setMessages] = useState([])
    const [draft, setDraft] = useState('')
    const [loading, setLoading] = useState(true)
    const [loadingOlder, setLoadingOlder] = useState(false)
    const [sending, setSending] = useState(false)
    const [historyError, setHistoryError] = useState('')
    const [sendError, setSendError] = useState('')
    const [nextCursor, setNextCursor] = useState(null)
    const [refresh, setRefresh] = useState(0)
    const [accessDenied, setAccessDenied] = useState(false)
    const viewport = useRef(null)
    const followLatest = useRef(true)
    const preserveScroll = useRef(null)
    const mounted = useRef(false)
    const sendingRef = useRef(false)
    const olderRef = useRef(false)
    const generation = useRef(0)
    const attempt = useRef(null)

    useEffect(() => {
        mounted.current = true
        return () => { mounted.current = false }
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        const version = ++generation.current
        function onMessage(message) {
            if (message?.roomId !== roomId.toLowerCase() || !message._id || typeof message.text !== 'string') return
            setMessages(previous => mergeMessages(previous, [message]))
        }
        // Subscribe before loading history so a message arriving during the GET
        // is merged instead of lost or rendered twice.
        socket?.on('chat:message', onMessage)
        async function load() {
            await Promise.resolve()
            if (controller.signal.aborted) return
            setLoading(true)
            setHistoryError('')
            try {
                const data = await listMessages({ roomId, signal: controller.signal })
                if (controller.signal.aborted) return
                setMessages(previous => mergeMessages(previous, data.messages))
                // Restart pagination at the refreshed page: retaining an older
                // cursor could skip messages from a long disconnection.
                setNextCursor(data.nextCursor)
                setAccessDenied(false)
            } catch (error) {
                if (controller.signal.aborted) return
                if ([401, 403, 404].includes(error.response?.status)) {
                    setAccessDenied(true)
                    setMessages([])
                }
                setHistoryError(error.response?.data?.message || 'Unable to load chat. Please retry.')
            } finally {
                if (!controller.signal.aborted && version === generation.current) setLoading(false)
            }
        }
        void load()
        return () => {
            controller.abort()
            socket?.off('chat:message', onMessage)
        }
    }, [roomId, socket, refresh])

    useLayoutEffect(() => {
        const element = viewport.current
        if (!element) return
        if (preserveScroll.current) {
            const previous = preserveScroll.current
            element.scrollTop = previous.top + element.scrollHeight - previous.height
            preserveScroll.current = null
        } else if (followLatest.current) {
            element.scrollTop = element.scrollHeight
        }
    }, [messages])

    async function loadOlder() {
        if (!nextCursor || olderRef.current || loading) return
        const version = generation.current
        olderRef.current = true
        setLoadingOlder(true)
        setHistoryError('')
        try {
            const data = await listMessages({ roomId, before: nextCursor })
            if (!mounted.current || version !== generation.current) return
            const element = viewport.current
            if (element) preserveScroll.current = { top: element.scrollTop, height: element.scrollHeight }
            setMessages(previous => mergeMessages(previous, data.messages))
            setNextCursor(data.nextCursor)
        } catch (error) {
            if (mounted.current && version === generation.current) {
                if ([401, 403, 404].includes(error.response?.status)) {
                    setAccessDenied(true)
                    setMessages([])
                }
                setHistoryError(error.response?.data?.message || 'Unable to load older messages.')
            }
        } finally {
            olderRef.current = false
            if (mounted.current) setLoadingOlder(false)
        }
    }

    async function submit(event) {
        event.preventDefault()
        const text = draft.trim()
        if (!text || text.length > 2000 || sendingRef.current || !socket?.connected || accessDenied) return
        if (!attempt.current || attempt.current.text !== text) {
            attempt.current = { text, clientMessageId: crypto.randomUUID() }
        }
        sendingRef.current = true
        setSending(true)
        setSendError('')
        try {
            const data = await sendMessage({ roomId, ...attempt.current })
            if (!mounted.current) return
            followLatest.current = true
            setMessages(previous => mergeMessages(previous, [data.message]))
            setDraft('')
            attempt.current = null
        } catch (error) {
            if (!mounted.current) return
            if ([401, 403, 404].includes(error.response?.status)) {
                setAccessDenied(true)
                setMessages([])
            }
            setSendError(error.response?.data?.message || 'Message not confirmed. Press Send to retry; your draft is saved.')
        } finally {
            sendingRef.current = false
            if (mounted.current) setSending(false)
        }
    }

    return (
        <section className="room-chat" aria-labelledby="room-chat-title">
            <h2 id="room-chat-title">Room chat</h2>
            {!socket?.connected && <p role="status">Chat is reconnecting. Your draft is kept.</p>}
            {loading && <p role="status">Loading messages...</p>}
            {historyError && <p role="alert">{historyError} <button type="button" onClick={() => setRefresh(value => value + 1)}>Retry history</button></p>}
            {nextCursor && !accessDenied && (
                <button type="button" onClick={loadOlder} disabled={loading || loadingOlder}>
                    {loadingOlder ? 'Loading older messages...' : 'Load older messages'}
                </button>
            )}
            <ol className="room-chat-messages" role="log" aria-label="Messages" aria-live="polite" ref={viewport}
                onScroll={() => {
                    const element = viewport.current
                    followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60
                }}>
                {messages.map(message => (
                    <li key={message._id} className={message.sender._id === userId ? 'room-chat-own' : ''}>
                        <div className="room-chat-meta">
                            <strong>{message.sender.username}{message.sender._id === userId ? ' (you)' : ''}</strong>
                            <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>
                                {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </time>
                        </div>
                        <p>{message.text}</p>
                    </li>
                ))}
            </ol>
            {!loading && !historyError && messages.length === 0 && <p>No messages yet. Start the conversation.</p>}
            <form onSubmit={submit}>
                <label htmlFor="room-chat-draft">Message</label>
                <textarea id="room-chat-draft" value={draft} maxLength={2000} rows={3}
                    disabled={sending || accessDenied} onChange={event => setDraft(event.target.value)}
                    placeholder="Write to your room..." aria-describedby="room-chat-count" />
                <div className="room-chat-actions">
                    <small id="room-chat-count">{draft.length}/2000</small>
                    <button type="submit" disabled={!draft.trim() || sending || accessDenied || !socket?.connected}>
                        {sending ? 'Sending...' : 'Send'}
                    </button>
                </div>
            </form>
            {sendError && <p role="alert">{sendError}</p>}
        </section>
    )
}
