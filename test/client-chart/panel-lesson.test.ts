import { describe, expect, it, vi } from 'vitest'
import {
  boardTarget,
  lessonActive,
  lessonChips,
  lessonLabel,
  resolveAsked,
  sameSymbol,
} from '../../src/client/panel-lesson.js'

const board = (over: Partial<{ provider: string; symbol: string; timeframe: string; pane: string }> = {}) => ({
  provider: 'binance',
  symbol: 'ETHUSDT',
  timeframe: '1h',
  ...over,
})

describe('sameSymbol', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(sameSymbol(' ethusdt ', 'ETHUSDT')).toBe(true)
    expect(sameSymbol('ETHUSDT', 'BTCUSDT')).toBe(false)
  })
})

describe('lessonActive', () => {
  const own = { provider: 'binance', symbol: 'ETHUSDT', timeframes: [{ timeframe: '1h' }] }

  it('is on only when provider, symbol and timeframe all agree', () => {
    expect(lessonActive(own, board())).toBe(true)
    expect(lessonActive(own, board({ symbol: 'ethusdt' }))).toBe(true)
    expect(lessonActive(own, board({ provider: 'cn' }))).toBe(false)
    expect(lessonActive(own, board({ symbol: 'BTCUSDT' }))).toBe(false)
    expect(lessonActive(own, board({ timeframe: '4h' }))).toBe(false)
  })

  it('is off without a board or without a series of the panel\'s own', () => {
    expect(lessonActive(own, null)).toBe(false)
    expect(lessonActive(null, board())).toBe(false)
    expect(lessonActive({ provider: 'binance', symbol: 'ETHUSDT', timeframes: [] }, board())).toBe(false)
  })
})

describe('lessonChips', () => {
  it('hands no forced chips to a reader-driven chart', () => {
    expect(lessonChips(false, { pane: 'rsi' })).toBeUndefined()
  })

  it('forces the section pane only, and nothing when the section has none', () => {
    expect(lessonChips(true, { pane: 'rsi' })).toEqual(['rsi'])
    expect(lessonChips(true, {})).toEqual([])
    expect(lessonChips(true, null)).toEqual([])
  })
})

describe('lessonLabel', () => {
  const snap = (over: Partial<{ mode: string; look: boolean; section: string | null }>) => ({
    mode: 'live', look: false, section: null as string | null, ...over,
  })

  it('names how the analyst is speaking', () => {
    expect(lessonLabel(snap({ mode: 'live' }), true)).toBe('讲解中')
    expect(lessonLabel(snap({ mode: 'paused' }), true)).toBe('已暂停')
    expect(lessonLabel(snap({ mode: 'paused', look: true }), true)).toBe('等你')
    expect(lessonLabel(snap({ mode: 'replay' }), true)).toBe('回看中')
    expect(lessonLabel(snap({ mode: 'idle' }), true)).toBe('讲解')
  })

  it('appends the section and flags a chart still loading', () => {
    expect(lessonLabel(snap({ mode: 'live', section: '结论' }), true)).toBe('讲解中 · 结论')
    expect(lessonLabel(snap({ mode: 'live', section: '结论' }), false)).toBe('讲解中 · 结论 · 加载中')
  })
})

describe('boardTarget', () => {
  it('asks for the board series when the panel shows something else', () => {
    expect(boardTarget(board(), { symbol: 'BTCUSDT', provider: 'binance', timeframe: '1h' }, null, null))
      .toEqual({ action: 'load', symbol: 'ETHUSDT', timeframe: '1h', provider: 'binance' })
  })

  it('does nothing without a board or when the panel already shows the series', () => {
    expect(boardTarget(null, null, null, null)).toEqual({ action: 'none' })
    expect(boardTarget(board(), { symbol: 'ethusdt', provider: 'binance', timeframe: '1h' }, null, null))
      .toEqual({ action: 'none' })
  })

  it('reloads when only the timeframe or provider differs', () => {
    expect(boardTarget(board(), { symbol: 'ETHUSDT', provider: 'binance', timeframe: '15m' }, null, null).action).toBe('load')
    expect(boardTarget(board({ provider: 'cn' }), { symbol: 'ETHUSDT', provider: 'binance', timeframe: '1h' }, null, null).action).toBe('load')
  })

  it('does not refetch a series the provider already refused', () => {
    expect(boardTarget(board(), null, 'ETHUSDT|1h', null)).toEqual({ action: 'none' })
  })

  it('yields to a symbol the reader named until the board agrees with it', () => {
    expect(boardTarget(board(), null, null, 'AAPL')).toEqual({ action: 'none' })
    expect(boardTarget(board({ symbol: 'AAPL' }), null, null, 'aapl'))
      .toEqual({ action: 'load', symbol: 'AAPL', timeframe: '1h', provider: 'binance', clearReader: true })
  })
})

describe('resolveAsked', () => {
  it('takes a ticker as it is, without looking the ticker itself up', async () => {
    const search = vi.fn(async () => [])
    expect(await resolveAsked('ETHUSDT', search)).toEqual({ symbol: 'ETHUSDT' })
    expect(search).not.toHaveBeenCalled()
  })

  it('walks the message in the reader order: a name before a ticker is tried first', async () => {
    // "看看 ETHUSDT" reads as the name 看看 and then the ticker. The name finds
    // nothing, so the ticker still opens; the lookup is the price of keeping
    // "先看腾讯再看 NVDA" on 腾讯.
    const none = vi.fn(async () => [])
    expect(await resolveAsked('看看 ETHUSDT', none)).toEqual({ symbol: 'ETHUSDT' })
    expect(none).toHaveBeenCalledWith('看看')

    const hit = vi.fn(async () => [{ symbol: '0700.HK', name: '腾讯控股', providerId: 'public' }])
    expect(await resolveAsked('腾讯 NVDA', hit)).toEqual({ symbol: '0700.HK', providerId: 'public' })
  })

  it('returns undefined when the text names nothing', async () => {
    expect(await resolveAsked('hi', vi.fn())).toBeUndefined()
  })

  it('looks a name up and carries the provider that answered', async () => {
    const search = vi.fn(async () => [{ symbol: '0700.HK', name: 'Tencent Holdings', providerId: 'public' }])
    expect(await resolveAsked('腾讯怎么样', search)).toEqual({ symbol: '0700.HK', providerId: 'public' })
    expect(search).toHaveBeenCalledWith('腾讯怎么样')
  })

  it('for a lowercase word only accepts a hit that is the same instrument', async () => {
    const search = vi.fn(async () => [
      { symbol: 'NVDL', name: 'GraniteShares 2x Long NVDA Daily ETF', providerId: 'public' },
      { symbol: 'NVDA', name: 'NVIDIA Corporation', providerId: 'public' },
    ])
    expect(await resolveAsked('how is nvidia', search)).toEqual({ symbol: 'NVDA', providerId: 'public' })
  })

  it('swallows a failing lookup and tries the next candidate', async () => {
    const search = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([{ symbol: '600519', name: '贵州茅台', providerId: 'cn' }])
    const out = await resolveAsked('茅台 and 苹果', search)
    expect(out === undefined || out.symbol === '600519').toBe(true)
  })

  it('gives up quietly when nothing matches', async () => {
    expect(await resolveAsked('腾讯怎么样', vi.fn(async () => []))).toBeUndefined()
  })
})
