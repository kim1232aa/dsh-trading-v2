import { describe, expect, it } from 'vitest'
import { enrichChartTimeframe, seriesRows } from '../src/client/ChartCard.js'
import { candlesToPayload } from '../src/client/market-client.js'
import type { ChartTimeframeData } from '../src/client/payload.js'

/** Chip figure keys used by TM_MACD / STOCH / ADX / MFI / BB in ChartCard. */
const CHIP_SERIES_KEYS = [
  'macd_hist', 'macd', 'macd_signal',
  'stoch_k', 'stoch_d',
  'adx', 'plus_di', 'minus_di',
  'mfi14',
  'bb_upper', 'bb_middle', 'bb_lower',
] as const

function synthCandles(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const base = 100 + Math.sin(i / 8) * 5 + i * 0.05
    return {
      time: new Date(Date.UTC(2024, 0, 1, 0, i)).toISOString(),
      open: base - 0.2,
      high: base + 1,
      low: base - 1,
      close: base,
      volume: 1000 + i,
    }
  })
}

describe('enrichChartTimeframe (live panel chips)', () => {
  it('reuses enrichment for annotation-only payload changes, retaining new annotations', () => {
    const raw = candlesToPayload('binance', 'ETHUSDT', '5m', synthCandles(80)).timeframes[0]!
    const first = enrichChartTimeframe(raw)
    const annotations = [{ type: 'level' as const, price: 100, label: 'new mark' }]
    const second = enrichChartTimeframe({ ...raw, annotations })
    expect(second.indicators).toBe(first.indicators)
    expect(second.series).toBe(first.series)
    expect(second.annotations).toBe(annotations)
  })

  it('invalidates enrichment for a changed forming candle even at the same timestamp', () => {
    const raw = candlesToPayload('binance', 'ETHUSDT', '5m', synthCandles(80)).timeframes[0]!
    const first = enrichChartTimeframe(raw)
    const candles = raw.candles.map((c, i) => i === 79 ? { ...c, high: 150, close: 149 } : c)
    const changed = enrichChartTimeframe({ ...raw, candles })
    expect(changed.series).not.toBe(first.series)
    expect(changed.series?.['rsi14']?.[79]).not.toBe(first.series?.['rsi14']?.[79])
  })

  it('reuses chip rows for the same series and never confuses different figures', () => {
    const raw = candlesToPayload('binance', 'ETHUSDT', '5m', synthCandles(80)).timeframes[0]!
    const data = enrichChartTimeframe(raw)
    const rows = seriesRows(data, { rsi: 'rsi14' })
    expect(seriesRows({ ...data }, { rsi: 'rsi14' })).toBe(rows)
    expect(seriesRows(data, { rsi: 'rsi7' })).not.toBe(rows)
    expect(seriesRows({ ...data, candles: data.candles.slice(1) }, { rsi: 'rsi14' })).toHaveLength(79)
  })

  it('fills indicators + series for candlesToPayload-style live frames', () => {
    const payload = candlesToPayload('binance', 'BTCUSDT', '15m', synthCandles(80))
    const raw = payload.timeframes[0]!
    expect(raw.indicators).toBeNull()
    expect(raw.series).toBeUndefined()

    const tf = enrichChartTimeframe(raw)
    expect(tf.indicators).not.toBeNull()
    expect(tf.indicators?.['macd']).toBeDefined()
    expect(tf.indicators?.['stochastic']).toBeDefined()
    expect(tf.indicators?.['adx14']).toBeDefined()
    expect(tf.indicators?.['mfi14']).toBeDefined()
    expect(tf.indicators?.['bollinger20']).toBeDefined()

    for (const key of CHIP_SERIES_KEYS) {
      const col = tf.series?.[key]
      expect(Array.isArray(col), key).toBe(true)
      expect(col!.length, key).toBe(tf.candles.length)
    }
  })

  it('keeps agent-provided series when already aligned', () => {
    const candles = synthCandles(10)
    const series = { rsi14: candles.map((_, i) => i) }
    const raw: ChartTimeframeData = {
      timeframe: '15m',
      candles,
      indicators: { macd: { state: 'bullish' } },
      series,
    }
    const tf = enrichChartTimeframe(raw)
    expect(tf.series).toBe(series)
    expect(tf.indicators).toBe(raw.indicators)
  })
})
