/**
 * A walkthrough section's indicator columns land on the column's own live
 * series. The two are different lengths and the live one keeps ticking, so
 * the join is by bar time. Joining by position would shift every value by the
 * length difference and the pane would show numbers the model never read.
 */
import { describe, expect, it, vi } from 'vitest'
import { createMarketClient, withLessonSeries } from '../../src/client/market-client.js'
import type { RpcCaller } from '../../src/client/market-client.js'
import type { ChartPayload } from '../../src/client/payload.js'

const DAY = 86_400_000
const T0 = Date.parse('2026-10-01T00:00:00.000Z')
const bar = (i: number) => {
  const time = new Date(T0 + i * DAY).toISOString()
  return { time, open: 10, high: 12, low: 9, close: 11, volume: 1 }
}

function live(n: number, series?: Record<string, (number | null)[]>): ChartPayload {
  return {
    kind: 'chart',
    version: 1,
    provider: 'binance',
    symbol: 'ETHUSDT',
    timeframes: [{ timeframe: '1d', candles: Array.from({ length: n }, (_, i) => bar(i)), ...(series ? { series } : {}) }],
    annotations: [],
    scenarios: [],
  } as unknown as ChartPayload
}

describe('withLessonSeries', () => {
  it('returns the same payload when the section carried no columns', () => {
    const p = live(5)
    expect(withLessonSeries(p, undefined)).toBe(p)
  })

  it('aligns by bar time, not position', () => {
    // The section read bars 3..5 only; the live series has 8 bars.
    const out = withLessonSeries(live(8), {
      t: [3, 4, 5].map(i => T0 + i * DAY),
      cols: { rsi14: [30, 40, 50] },
    })
    expect(out.timeframes[0]?.series?.['rsi14']).toEqual([null, null, null, 30, 40, 50, null, null])
  })

  it('leaves bars outside the section window empty instead of recomputing', () => {
    const out = withLessonSeries(live(4), { t: [T0 + 10 * DAY], cols: { rsi14: [99] } })
    expect(out.timeframes[0]?.series?.['rsi14']).toEqual([null, null, null, null])
  })

  it('maps a missing or null source value to null', () => {
    const out = withLessonSeries(live(3), { t: [T0, T0 + DAY], cols: { adx: [null] } })
    expect(out.timeframes[0]?.series?.['adx']).toEqual([null, null, null])
  })

  it('keeps the live payload columns it was not asked to replace', () => {
    const out = withLessonSeries(live(2, { sma20: [1, 2] }), { t: [T0], cols: { rsi14: [55] } })
    expect(out.timeframes[0]?.series).toEqual({ sma20: [1, 2], rsi14: [55, null] })
  })

  it('does not mutate its input', () => {
    const p = live(3)
    withLessonSeries(p, { t: [T0], cols: { rsi14: [1] } })
    expect(p.timeframes[0]?.series).toBeUndefined()
  })
})

describe('MarketClient.search', () => {
  const rpc = (value: unknown): { rpc: RpcCaller; call: ReturnType<typeof vi.fn> } => {
    const call = vi.fn(async () => ({ ok: true as const, value }))
    return { rpc: { call } as unknown as RpcCaller, call }
  }

  it('sends the query and returns the items', async () => {
    const { rpc: r, call } = rpc({ query: '腾讯', items: [{ symbol: 'HK.00700', providerId: 'public' }] })
    const items = await createMarketClient(r).search('腾讯')
    expect(call).toHaveBeenCalledWith('/dsh-trading-market', 'search', { query: '腾讯' }, undefined)
    expect(items).toEqual([{ symbol: 'HK.00700', providerId: 'public' }])
  })

  it('names the provider when one is given and accepts a bare AbortSignal', async () => {
    const { rpc: r, call } = rpc({ query: 'x', items: [] })
    const ac = new AbortController()
    await createMarketClient(r).search('x', { providerId: 'cn', signal: ac.signal })
    expect(call).toHaveBeenLastCalledWith('/dsh-trading-market', 'search', { query: 'x', providerId: 'cn' }, ac.signal)
    await createMarketClient(r).search('y', ac.signal)
    expect(call).toHaveBeenLastCalledWith('/dsh-trading-market', 'search', { query: 'y' }, ac.signal)
  })
})
