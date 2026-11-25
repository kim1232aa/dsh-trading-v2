/**
 * The DSH 0.2 session seam. Every fake here mirrors a verified contract shape:
 * prompt() resolves a RemoteResult, the inbox projection is
 * { 'next-turn', 'next-step' } arrays of UserMessage, durable events are
 * { type, seq, time, data } with a UserMessage as the user/message data, and
 * snapshots are ObservableSnapshot { getSnapshot, subscribe }.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_FEED,
  SNIFF_FRESH_MS,
  createSessionFeedObservable,
  extractLatestUserPrompt,
  hasUserReplyAfter,
  sendReply,
} from '../../src/client/dsh-session.js'

function store<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
    set(next: T) { value = next; for (const fn of [...listeners]) fn() },
    size: () => listeners.size,
  }
}

const userMsg = (text: string, kind = 'user') => ({
  id: 'm-' + text, role: 'user', content: [{ type: 'text', text }], source: { kind },
})
const userEvent = (seq: number, text: string, time: number, kind = 'user') => ({
  type: 'event' as const, event: { type: 'user/message', seq, time, data: userMsg(text, kind) },
})
const otherEvent = (seq: number) => ({
  type: 'event' as const, event: { type: 'step/start', seq, time: 1, data: { turn: 1, step: 1 } },
})
const pending = (text: string, time = 1) => ({ requestId: 'r-' + text, placement: 'transcript', time, text, attachments: [] })

function fakeCtx(binding: unknown) {
  return { get: (name: string) => (name === 'sessions' ? { binding: () => binding } : undefined) }
}

afterEach(() => vi.restoreAllMocks())

describe('sendReply', () => {
  it('queues one text part through the session binding', async () => {
    const prompt = vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } }))
    const ok = await sendReply(fakeCtx({ session: { prompt } }), 's1', 'go on')
    expect(ok).toBe(true)
    expect(prompt).toHaveBeenCalledWith([{ type: 'text', text: 'go on' }], 'queue')
  })

  it('reports false and never throws when the sessions service is absent', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await sendReply({ get: () => undefined }, 's1', 'hi')).toBe(false)
  })

  it('reports false when the session is not retained', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await sendReply(fakeCtx(undefined), 's1', 'hi')).toBe(false)
  })

  it('reports false on a business error result', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const prompt = async () => ({ ok: false as const, error: { code: 'busy', message: 'no' } })
    expect(await sendReply(fakeCtx({ session: { prompt } }), 's1', 'hi')).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('swallows a rejected prompt as a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const prompt = async () => { throw new Error('socket closed') }
    expect(await sendReply(fakeCtx({ session: { prompt } }), 's1', 'hi')).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('does not send blank text', async () => {
    const prompt = vi.fn()
    expect(await sendReply(fakeCtx({ session: { prompt } }), 's1', '   ')).toBe(false)
    expect(prompt).not.toHaveBeenCalled()
  })
})

describe('extractLatestUserPrompt', () => {
  const now = 1_000_000

  it('prefers the inbox, then pending submissions, then durable events', () => {
    const events = [userEvent(3, 'from events', now - 1000)]
    const feed = {
      pendingSubmissions: [pending('from pending')],
      inbox: { 'next-turn': [userMsg('from inbox')], 'next-step': [] },
      events,
    }
    expect(extractLatestUserPrompt(feed, now)?.text).toBe('from inbox')
    expect(extractLatestUserPrompt({ ...feed, inbox: undefined }, now)?.text).toBe('from pending')
    expect(extractLatestUserPrompt({ ...feed, inbox: undefined, pendingSubmissions: [] }, now)?.text).toBe('from events')
  })

  it('takes the newest queued turn, falling back to next-step', () => {
    const inbox = { 'next-turn': [userMsg('a'), userMsg('b')], 'next-step': [userMsg('s')] }
    expect(extractLatestUserPrompt({ pendingSubmissions: [], inbox, events: [] }, now)?.text).toBe('b')
    const onlyStep = { 'next-turn': [], 'next-step': [userMsg('s')] }
    expect(extractLatestUserPrompt({ pendingSubmissions: [], inbox: onlyStep, events: [] }, now)?.text).toBe('s')
  })

  it('ignores synthetic injects such as goal continuation or skill content', () => {
    const events = [userEvent(1, 'real question', now - 500), userEvent(2, 'injected context', now - 100, 'goal')]
    expect(extractLatestUserPrompt({ pendingSubmissions: [], inbox: undefined, events }, now)?.text).toBe('real question')
  })

  it('refuses a durable message older than the freshness window', () => {
    const events = [userEvent(1, 'old', now - SNIFF_FRESH_MS - 1)]
    expect(extractLatestUserPrompt({ pendingSubmissions: [], inbox: undefined, events }, now)).toBeUndefined()
    const fresh = [userEvent(1, 'fresh', now - SNIFF_FRESH_MS)]
    expect(extractLatestUserPrompt({ pendingSubmissions: [], inbox: undefined, events: fresh }, now)?.text).toBe('fresh')
  })

  it('joins text blocks, skips non-text blocks and blank prompts', () => {
    const multi = { ...userMsg('x'), content: [{ type: 'text', text: 'look at ' }, { type: 'image' }, { type: 'text', text: 'BTC' }] }
    const inbox = { 'next-turn': [multi], 'next-step': [] }
    expect(extractLatestUserPrompt({ pendingSubmissions: [], inbox, events: [] }, now)?.text).toBe('look at BTC')
    const blank = { 'next-turn': [userMsg('   ')], 'next-step': [] }
    expect(extractLatestUserPrompt({ pendingSubmissions: [], inbox: blank, events: [] }, now)).toBeUndefined()
  })

  it('returns undefined for an empty feed', () => {
    expect(extractLatestUserPrompt(EMPTY_FEED, now)).toBeUndefined()
  })
})

describe('hasUserReplyAfter', () => {
  it('is false when only older user messages exist', () => {
    const events = [userEvent(2, 'before', 1), otherEvent(5)]
    expect(hasUserReplyAfter({ pendingSubmissions: [], inbox: undefined, events }, 4)).toBe(false)
  })

  it('is true once a later human message is durable', () => {
    const events = [userEvent(2, 'before', 1), userEvent(7, 'reply', 2)]
    expect(hasUserReplyAfter({ pendingSubmissions: [], inbox: undefined, events }, 4)).toBe(true)
  })

  it('does not count synthetic injects as a reply', () => {
    const events = [userEvent(7, 'skill body', 2, 'goal')]
    expect(hasUserReplyAfter({ pendingSubmissions: [], inbox: undefined, events }, 4)).toBe(false)
  })

  it('counts a message still pending or queued', () => {
    expect(hasUserReplyAfter({ pendingSubmissions: [pending('hi')], inbox: undefined, events: [] }, 4)).toBe(true)
    const inbox = { 'next-turn': [userMsg('hi')], 'next-step': [] }
    expect(hasUserReplyAfter({ pendingSubmissions: [], inbox, events: [] }, 4)).toBe(true)
  })
})

describe('createSessionFeedObservable', () => {
  function rig() {
    const session = { ...store({ pendingSubmissions: [] as unknown[] }), projections: { faceOf: (_: string) => inbox } }
    const inbox = store<unknown>(undefined)
    const eventSource = store({ entries: [] as unknown[] })
    return { session, inbox, eventSource, binding: { session, eventSource } }
  }

  it('hands back one shared empty observable without a session', () => {
    const a = createSessionFeedObservable({ get: () => undefined }, undefined)
    const b = createSessionFeedObservable({ get: () => undefined }, undefined)
    const c = createSessionFeedObservable(fakeCtx(undefined), 's1')
    expect(a).toBe(b)
    expect(a).toBe(c)
    expect(a.getSnapshot()).toBe(EMPTY_FEED)
    expect(a.subscribe(() => {})).toBeTypeOf('function')
  })

  it('returns a stable snapshot between reads and a fresh one after a change', () => {
    const r = rig()
    const feed = createSessionFeedObservable(fakeCtx(r.binding), 's1')
    const first = feed.getSnapshot()
    expect(feed.getSnapshot()).toBe(first)
    r.eventSource.set({ entries: [userEvent(1, 'hi', 1)] })
    const second = feed.getSnapshot()
    expect(second).not.toBe(first)
    expect(second.events).toHaveLength(1)
    expect(feed.getSnapshot()).toBe(second)
  })

  it('reflects pending submissions and the inbox projection', () => {
    const r = rig()
    const feed = createSessionFeedObservable(fakeCtx(r.binding), 's1')
    r.session.set({ pendingSubmissions: [pending('queued')] })
    r.inbox.set({ 'next-turn': [userMsg('later')], 'next-step': [] })
    const snap = feed.getSnapshot()
    expect(snap.pendingSubmissions).toHaveLength(1)
    expect(extractLatestUserPrompt(snap, Date.now())?.text).toBe('later')
  })

  it('notifies on relevant changes and unsubscribes cleanly', () => {
    const r = rig()
    const feed = createSessionFeedObservable(fakeCtx(r.binding), 's1')
    const fn = vi.fn()
    const off = feed.subscribe(fn)
    r.session.set({ pendingSubmissions: [] })
    r.inbox.set(undefined)
    r.eventSource.set({ entries: [] })
    expect(fn).toHaveBeenCalledTimes(3)
    off()
    expect(r.session.size() + r.inbox.size() + r.eventSource.size()).toBe(0)
    r.session.set({ pendingSubmissions: [] })
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('stays quiet for streamed assistant chunks and settlements, which cannot carry a user prompt', () => {
    const r = rig()
    const feed = createSessionFeedObservable(fakeCtx(r.binding), 's1')
    const fn = vi.fn()
    feed.subscribe(fn)
    const chunk = { type: 'transient', event: { type: 'assistant/live-chunk', seq: 9, time: 1, data: {} } }
    r.eventSource.set({ entries: [chunk], change: { kind: 'append', entries: [chunk] } } as never)
    r.eventSource.set({ entries: [chunk], change: { kind: 'settle-assistant', attemptId: 'a1' } } as never)
    r.eventSource.set({ entries: [otherEvent(10)], change: { kind: 'append', entries: [otherEvent(10)] } } as never)
    expect(fn).not.toHaveBeenCalled()
  })

  it('wakes for an appended user message, a replaced window and a prepended history page', () => {
    const r = rig()
    const feed = createSessionFeedObservable(fakeCtx(r.binding), 's1')
    const fn = vi.fn()
    feed.subscribe(fn)
    const u = userEvent(11, 'hello', 1)
    r.eventSource.set({ entries: [u], change: { kind: 'append', entries: [u] } } as never)
    r.eventSource.set({ entries: [u], change: { kind: 'replace', entries: [u] } } as never)
    r.eventSource.set({ entries: [u], change: { kind: 'prepend', entries: [u] } } as never)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not read the event entries until a consumer asks for them', () => {
    const r = rig()
    const entries = vi.fn(() => [] as unknown[])
    const lazy = { getSnapshot: () => ({ get entries() { return entries() } }), subscribe: r.eventSource.subscribe }
    const feed = createSessionFeedObservable(fakeCtx({ session: r.session, eventSource: lazy }), 's1')
    feed.getSnapshot()
    expect(entries).not.toHaveBeenCalled()
    void feed.getSnapshot().events
    expect(entries).toHaveBeenCalledTimes(1)
  })

  it('caches one observable per binding so React hook identity stays stable', () => {
    const r = rig()
    const ctx = fakeCtx(r.binding)
    expect(createSessionFeedObservable(ctx, 's1')).toBe(createSessionFeedObservable(ctx, 's1'))
  })
})
