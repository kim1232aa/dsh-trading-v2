/** Shared lifecycle for the CVD and CoinGlass background requests. */
export interface PanelPollOptions<T> {
  enabled: boolean
  live: boolean
  width: number
  intervalMs: number
  timeoutMs?: number
  load: (signal: AbortSignal) => Promise<T>
  onData: (value: T) => void
  onError?: (error: unknown) => void
  visibility?: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>
}

/** Dispose on dependency changes: no old transport may update a new chart. */
export function startPanelPolling<T>(opts: PanelPollOptions<T>): { refresh: () => void; dispose: () => void } {
  if (!opts.enabled || !opts.live || opts.width <= 0) return { refresh: () => {}, dispose: () => {} }
  const visibility = opts.visibility ?? (typeof document === 'undefined' ? undefined : document)
  let active = true
  let inFlight: { ctl: AbortController; deadline: ReturnType<typeof setTimeout> } | null = null
  const cancel = (): void => {
    if (inFlight === null) return
    const request = inFlight
    inFlight = null
    clearTimeout(request.deadline)
    request.ctl.abort()
  }
  const pull = (manual = false): void => {
    if (!active || visibility?.hidden || (!manual && inFlight !== null)) return
    cancel()
    const ctl = new AbortController()
    const request = {
      ctl,
      deadline: setTimeout(() => {
        if (!active || inFlight !== request) return
        cancel()
        opts.onError?.(new Error('timeout'))
      }, opts.timeoutMs ?? 25_000),
    }
    inFlight = request
    const done = (deliver: () => void): void => {
      if (!active || inFlight !== request) return
      clearTimeout(request.deadline)
      inFlight = null
      if (!ctl.signal.aborted) deliver()
    }
    try {
      void opts.load(ctl.signal).then(
        value => done(() => opts.onData(value)),
        error => done(() => opts.onError?.(error)),
      )
    } catch (error) { done(() => opts.onError?.(error)) }
  }
  const onVisibility = (): void => { if (visibility?.hidden) cancel(); else pull() }
  visibility?.addEventListener('visibilitychange', onVisibility)
  pull()
  const timer = setInterval(() => pull(), opts.intervalMs)
  return {
    refresh: () => pull(true),
    dispose: () => {
      active = false
      cancel()
      clearInterval(timer)
      visibility?.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
