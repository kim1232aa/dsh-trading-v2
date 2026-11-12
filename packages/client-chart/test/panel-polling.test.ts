import { afterEach, describe, expect, it, vi } from 'vitest'
import { startPanelPolling } from '../src/client/panel-polling.js'

// A controllable external RPC: cancellation may arrive before the transport settles.
function source() {
  const requests: { signal: AbortSignal; resolve: (n: number) => void }[] = []
  return {
    requests,
    load: (signal: AbortSignal) => new Promise<number>(resolve => { requests.push({ signal, resolve }) }),
  }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve() }
afterEach(() => vi.useRealTimers())

describe('panel polling lifecycle', () => {
  it.each([
    { enabled: false, live: true, width: 400 },
    { enabled: true, live: false, width: 400 },
    { enabled: true, live: true, width: 0 },
  ])('does no work for disabled, paused or collapsed panels: %j', async state => {
    vi.useFakeTimers()
    const rpc = source()
    const poll = startPanelPolling({ ...state, intervalMs: 1000, load: rpc.load, onData: () => {} })
    poll.refresh()
    await vi.advanceTimersByTimeAsync(5000)
    expect(rpc.requests).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    poll.dispose()
  })

  it('stops requests, deadlines and late results on disposal, and starts fresh on resume', async () => {
    vi.useFakeTimers()
    const rpc = source()
    const values: number[] = []
    const opts = { enabled: true, live: true, width: 400, intervalMs: 1000, load: rpc.load, onData: (n: number) => values.push(n) }
    const first = startPanelPolling(opts)
    expect(rpc.requests).toHaveLength(1)
    first.dispose()
    expect(rpc.requests[0]!.signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    rpc.requests[0]!.resolve(1)
    await flush()
    expect(values).toEqual([])
    const resumed = startPanelPolling(opts)
    rpc.requests[1]!.resolve(2)
    await flush()
    expect(values).toEqual([2])
    resumed.dispose()
  })

  it('a manual refresh preempts slow requests and discards their late result', async () => {
    vi.useFakeTimers()
    const rpc = source()
    const values: number[] = []
    const poll = startPanelPolling({ enabled: true, live: true, width: 400, intervalMs: 1000, load: rpc.load, onData: n => values.push(n) })
    await vi.advanceTimersByTimeAsync(2000)
    expect(rpc.requests).toHaveLength(1)
    poll.refresh()
    expect(rpc.requests[0]!.signal.aborted).toBe(true)
    rpc.requests[1]!.resolve(2)
    rpc.requests[0]!.resolve(1)
    await flush()
    expect(values).toEqual([2])
    poll.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a timed-out transport cannot wedge the polling loop or publish late data', async () => {
    vi.useFakeTimers()
    const rpc = source()
    const values: number[] = []
    const errors: unknown[] = []
    const poll = startPanelPolling({ enabled: true, live: true, width: 400, intervalMs: 1000, timeoutMs: 1500, load: rpc.load, onData: n => values.push(n), onError: err => errors.push(err) })
    await vi.advanceTimersByTimeAsync(2000)
    expect(rpc.requests).toHaveLength(2)
    expect(rpc.requests[0]!.signal.aborted).toBe(true)
    expect(errors).toHaveLength(1)
    rpc.requests[0]!.resolve(1)
    rpc.requests[1]!.resolve(2)
    await flush()
    expect(values).toEqual([2])
    poll.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not poll a hidden tab and catches up when shown', async () => {
    vi.useFakeTimers()
    const rpc = source()
    const visibility = Object.assign(new EventTarget(), { hidden: true })
    const poll = startPanelPolling({ enabled: true, live: true, width: 400, intervalMs: 1000, load: rpc.load, onData: () => {}, visibility })
    await vi.advanceTimersByTimeAsync(2000)
    expect(rpc.requests).toHaveLength(0)
    visibility.hidden = false
    visibility.dispatchEvent(new Event('visibilitychange'))
    expect(rpc.requests).toHaveLength(1)
    visibility.hidden = true
    visibility.dispatchEvent(new Event('visibilitychange'))
    expect(rpc.requests[0]!.signal.aborted).toBe(true)
    poll.dispose()
    visibility.hidden = false
    visibility.dispatchEvent(new Event('visibilitychange'))
    expect(rpc.requests).toHaveLength(1)
  })
})
