import { describe, expect, it } from 'vitest'
import { dataForSeries, mergePanelTail, panelSeriesKey } from '../../src/client/panel-series.js'
import type { ChartPayload } from '../../src/client/payload.js'

const bar = { time: '2026-11-12T00:00:00Z', open: 2000, high: 2010, low: 1990, close: 2005, volume: 10 }
function chart(symbol = 'ETHUSDT', timeframe = '5m', provider = 'binance'): ChartPayload {
  return { kind: 'chart', version: 1, provider, symbol, timeframes: [{ timeframe, candles: [bar], indicators: null }] }
}

describe('panel series isolation', () => {
  it('keeps the live resource identity stable across ticks and annotation changes', () => {
    const own = chart()
    const next = { ...own, timeframes: [{ ...own.timeframes[0]!, candles: [{ ...bar, close: 2006 }], annotations: [{ type: 'hline', price: 1995 }] }] }
    expect(panelSeriesKey(own.symbol, own.timeframes[0]!.timeframe, own.provider)).toBe(panelSeriesKey(next.symbol, next.timeframes[0]!.timeframe, next.provider))
    expect(panelSeriesKey(undefined, '5m', 'binance')).toBeNull()
  })

  it.each([
    ['BTCUSDT', '5m', 'binance'],
    ['ETHUSDT', '15m', 'binance'],
    ['ETHUSDT', '5m', 'okx'],
  ])('does not display paused CVD from another series: %s %s %s', (symbol, tf, provider) => {
    const cached = { key: panelSeriesKey('ETHUSDT', '5m', 'binance')!, data: [{ time: bar.time, perp: 20, spot: 3 }] }
    expect(dataForSeries(cached, panelSeriesKey(symbol, tf, provider))).toBeNull()
    expect(dataForSeries(cached, cached.key)).toBe(cached.data)
  })

  it.each([
    ['BTCUSDT', '5m', 'binance'],
    ['ETHUSDT', '15m', 'binance'],
    ['ETHUSDT', '5m', 'okx'],
  ])('ignores late tails after switching series: %s %s %s', (symbol, tf, provider) => {
    const current = chart(symbol, tf, provider)
    const oldKey = panelSeriesKey('ETHUSDT', '5m', 'binance')!
    expect(mergePanelTail(current, oldKey, [{ ...bar, close: 2008 }])).toBe(current)
  })

  it('merges against the latest history without truncation or mutation, and reuses unchanged bars', () => {
    const key = panelSeriesKey('ETHUSDT', '5m', 'binance')!
    const current = chart()
    const older = { ...bar, time: '2026-11-11T23:55:00Z', close: 2001 }
    current.timeframes[0]!.candles = [older, bar]
    const next = mergePanelTail(current, key, [{ ...bar, close: 2008 }])!
    expect(next.timeframes[0]!.candles.map(c => c.close)).toEqual([2001, 2008])
    expect(current.timeframes[0]!.candles.map(c => c.close)).toEqual([2001, 2005])
    expect(mergePanelTail(next, key, [{ ...bar, close: 2008 }])).toBe(next)
    expect(mergePanelTail(null, key, [bar])).toBeNull()
  })
})
