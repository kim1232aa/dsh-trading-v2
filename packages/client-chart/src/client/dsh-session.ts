/**
 * The one place that talks to DSH 0.2's session surface.
 *
 * The chart column needs three things from the conversation it sits beside:
 * to send a reply into it, to read the question the user just asked (so the
 * chart can follow the instrument being discussed), and to know whether a
 * reply has already followed a question card (so a stale prompt stops
 * asking). Everything below is typed structurally against the verified 0.2
 * contracts rather than imported, so a reshaped session API breaks here, in
 * one file with one test, and nowhere else.
 *
 * Contracts relied on (dsh-api-session-controller 0.2.0-rc.2):
 *   ctx.sessions.binding(id) -> { session, eventSource }
 *   session.prompt(parts, 'queue') -> RemoteResult<{ accepted: true }>
 *   session.getSnapshot().pendingSubmissions -> local echoes not yet durable
 *   session.projections.faceOf('inbox') -> { 'next-turn', 'next-step' } UserMessage[]
 *   eventSource.getSnapshot() -> { entries, change }, entries are
 *     { type: 'event' | 'transient', event: { type, seq, time, data } }
 */

/** A snapshot source in the shape of the host's ObservableSnapshot. */
export interface FeedObservable<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

interface ContentBlockLike { readonly type?: string; readonly text?: string }

/** The slice of a UserMessage this seam reads. */
export interface UserMessageLike {
  readonly role?: string
  readonly content?: readonly ContentBlockLike[]
  readonly source?: { readonly kind?: string }
}

/** A local prompt echo the host accepted but has not yet made durable. */
export interface PendingSubmissionLike {
  readonly text?: string
  readonly time?: number
}

/** Pending agent input, as the inbox projection publishes it. */
export interface InboxLike {
  readonly 'next-turn': readonly UserMessageLike[]
  readonly 'next-step': readonly UserMessageLike[]
}

/** One durable or transient event window entry. */
export interface EventEntryLike {
  readonly type?: string
  readonly event?: {
    readonly type?: string
    readonly seq?: number
    readonly time?: number
    readonly data?: unknown
  }
}

/** Everything the conversation currently says about what the user asked. */
export interface SessionFeed {
  readonly pendingSubmissions: readonly PendingSubmissionLike[]
  readonly inbox: InboxLike | undefined
  readonly events: readonly EventEntryLike[]
}

/** The newest human prompt found in a feed. */
export interface UserPrompt {
  readonly text: string
  readonly time: number
}

/** The slice of a cordis Context this seam reads. */
export interface SessionContextLike {
  get(name: string): unknown
}

/** A durable human message older than this is history, not a question to follow. */
export const SNIFF_FRESH_MS = 60_000

/** The feed of a conversation that is not there: one frozen value, so hooks never see it change. */
export const EMPTY_FEED: SessionFeed = Object.freeze({ pendingSubmissions: [], inbox: undefined, events: [] })

const NOOP = (): void => {}
const EMPTY_OBSERVABLE: FeedObservable<SessionFeed> = Object.freeze({
  getSnapshot: () => EMPTY_FEED,
  subscribe: () => NOOP,
})

interface PromptFace {
  prompt(
    parts: Array<{ type: 'text'; text: string }>,
    mode: 'queue',
  ): Promise<{ ok: boolean; error?: unknown }>
}

interface BindingLike {
  readonly session: PromptFace & FeedObservable<{ pendingSubmissions?: readonly PendingSubmissionLike[] }> & {
    readonly projections: { faceOf(key: string): FeedObservable<unknown> }
  }
  readonly eventSource: FeedObservable<{
    readonly entries: readonly EventEntryLike[]
    readonly change?: { readonly kind?: string; readonly entries?: readonly EventEntryLike[] }
  }>
}

function bindingOf(ctx: SessionContextLike, sessionId: string | undefined): BindingLike | undefined {
  if (sessionId === undefined || sessionId === '') return undefined
  const sessions = ctx.get('sessions') as { binding?(id: string): unknown } | undefined
  if (sessions === undefined || typeof sessions.binding !== 'function') return undefined
  return sessions.binding(sessionId) as BindingLike | undefined
}

/**
 * Send a reply into the conversation as a queued user turn.
 * Never throws: a failed send is a warning, because the caller is a click
 * handler with nothing useful to do about it.
 * @param ctx - any client context.
 * @param sessionId - the conversation to reply into.
 * @param text - the reply; blank text is not sent.
 * @returns whether the host accepted the prompt.
 */
export async function sendReply(ctx: SessionContextLike, sessionId: string, text: string): Promise<boolean> {
  if (text.trim() === '') return false
  const binding = bindingOf(ctx, sessionId)
  if (binding === undefined) {
    console.warn('[client-chart] sendReply: session is not available', sessionId)
    return false
  }
  try {
    const result = await binding.session.prompt([{ type: 'text', text }], 'queue')
    if (!result.ok) {
      console.warn('[client-chart] sendReply: prompt rejected', result.error)
      return false
    }
    return true
  } catch (error: unknown) {
    console.warn('[client-chart] sendReply failed', error)
    return false
  }
}

function isHuman(message: UserMessageLike | undefined): message is UserMessageLike {
  return message !== undefined && message.source?.kind === 'user'
}

function textOf(message: UserMessageLike): string {
  let out = ''
  for (const block of message.content ?? []) {
    if (block.type === 'text' && typeof block.text === 'string') out += block.text
  }
  return out.trim()
}

function newestHuman(messages: readonly UserMessageLike[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!isHuman(message)) continue
    const text = textOf(message)
    if (text !== '') return text
  }
  return undefined
}

function isUserEvent(entry: EventEntryLike): entry is EventEntryLike & { event: { data: UserMessageLike } } {
  return entry.type === 'event' && entry.event?.type === 'user/message' && isHuman(entry.event.data as UserMessageLike)
}

/**
 * Read the question the user just asked, most immediate source first: queued
 * input, then a local echo, then the durable log. Injected context (goal
 * rounds, skill bodies) is not a question and is skipped. A durable message
 * older than {@link SNIFF_FRESH_MS} is history and is refused, so opening an
 * old conversation never yanks the chart to a stale instrument.
 * @param feed - the conversation's current feed.
 * @param now - wall clock in ms; injectable for tests.
 * @returns the prompt, or undefined when there is nothing fresh to follow.
 */
export function extractLatestUserPrompt(feed: SessionFeed, now: number = Date.now()): UserPrompt | undefined {
  if (feed.inbox !== undefined) {
    const queued = newestHuman(feed.inbox['next-turn']) ?? newestHuman(feed.inbox['next-step'])
    if (queued !== undefined) return { text: queued, time: now }
  }
  for (let i = feed.pendingSubmissions.length - 1; i >= 0; i--) {
    const echo = feed.pendingSubmissions[i]
    const text = (echo?.text ?? '').trim()
    if (text !== '') return { text, time: echo?.time ?? now }
  }
  for (let i = feed.events.length - 1; i >= 0; i--) {
    const entry = feed.events[i]
    if (entry === undefined || !isUserEvent(entry)) continue
    const text = textOf(entry.event.data)
    if (text === '') continue
    const time = entry.event.time ?? 0
    return now - time > SNIFF_FRESH_MS ? undefined : { text, time }
  }
  return undefined
}

/**
 * Whether the user has already answered since a given event.
 * Anything still pending or queued is necessarily newer than a durable event,
 * so it counts without a sequence comparison.
 * @param feed - the conversation's current feed.
 * @param callBlockSeq - sequence number of the event that asked.
 * @returns true once a later human message exists.
 */
export function hasUserReplyAfter(feed: SessionFeed, callBlockSeq: number): boolean {
  if (feed.pendingSubmissions.length > 0) return true
  if (feed.inbox !== undefined) {
    if (feed.inbox['next-turn'].some(isHuman) || feed.inbox['next-step'].some(isHuman)) return true
  }
  return feed.events.some(entry => isUserEvent(entry) && (entry.event.seq ?? -1) > callBlockSeq)
}

function readInbox(value: unknown): InboxLike | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const turn = (value as Record<string, unknown>)['next-turn']
  const step = (value as Record<string, unknown>)['next-step']
  if (!Array.isArray(turn) || !Array.isArray(step)) return undefined
  return value as InboxLike
}

/** A window change that cannot add or move a human message. */
function cannotCarryUserMessage(change: { kind?: string; entries?: readonly EventEntryLike[] } | undefined): boolean {
  if (change === undefined) return false
  if (change.kind === 'settle-assistant') return true
  if (change.kind !== 'append') return false
  return !(change.entries ?? []).some(entry => entry.type === 'event' && entry.event?.type === 'user/message')
}

const observables = new WeakMap<object, FeedObservable<SessionFeed>>()

function feedOf(binding: BindingLike): FeedObservable<SessionFeed> {
  const inboxFace = binding.session.projections.faceOf('inbox')
  let lastPending: unknown
  let lastInbox: unknown
  let lastWindow: unknown
  let cached: SessionFeed = EMPTY_FEED
  let primed = false

  return {
    getSnapshot() {
      const pending = binding.session.getSnapshot().pendingSubmissions ?? EMPTY_FEED.pendingSubmissions
      const rawInbox = inboxFace.getSnapshot()
      const window = binding.eventSource.getSnapshot()
      if (primed && pending === lastPending && rawInbox === lastInbox && window === lastWindow) return cached
      primed = true
      lastPending = pending
      lastInbox = rawInbox
      lastWindow = window
      // events is a getter: a streaming turn replaces the window per token, and
      // materializing a long history each time would cost far more than the
      // few consumers that ever read it.
      cached = Object.freeze({
        pendingSubmissions: pending,
        inbox: readInbox(rawInbox),
        get events() { return window.entries },
      })
      return cached
    },
    subscribe(listener) {
      let seenPending = binding.session.getSnapshot().pendingSubmissions
      const offSession = binding.session.subscribe(() => {
        const next = binding.session.getSnapshot().pendingSubmissions
        if (next === seenPending) return
        seenPending = next
        listener()
      })
      const offInbox = inboxFace.subscribe(listener)
      const offEvents = binding.eventSource.subscribe(() => {
        if (cannotCarryUserMessage(binding.eventSource.getSnapshot().change)) return
        listener()
      })
      return () => {
        offSession()
        offInbox()
        offEvents()
      }
    },
  }
}

/**
 * Build one stable observable over a conversation's pending input, queued
 * input and durable event window.
 *
 * Identity matters: React hooks read this by reference, so a conversation that
 * appears later must not change the hook order. Without a session the shared
 * empty observable is returned, and a binding keeps one observable for its
 * lifetime. Notifications are suppressed for changes that cannot hold a human
 * message (streamed assistant chunks, settlements, other durable events),
 * which are the overwhelming majority of window updates during a turn.
 * @param ctx - any client context.
 * @param sessionId - the conversation to watch; undefined means none.
 * @returns a snapshot observable, never undefined.
 */
export function createSessionFeedObservable(
  ctx: SessionContextLike,
  sessionId: string | undefined,
): FeedObservable<SessionFeed> {
  const binding = bindingOf(ctx, sessionId)
  if (binding === undefined) return EMPTY_OBSERVABLE
  let observable = observables.get(binding)
  if (observable === undefined) {
    observable = feedOf(binding)
    observables.set(binding, observable)
  }
  return observable
}
