/**
 * Two seams between the persistent chart column and the chat cards.
 *
 * 1. With the column open the chart lives there, so a tool-call card collapses
 *    to a one-line receipt (expandable) instead of burying the conversation
 *    under a copy of the chart per data read.
 * 2. A walkthrough section names the panes it wants. 'rsi' must mount ONE line
 *    (rsi14) in its own pane — not the RSI_GRID pair the reader's own RSI chip
 *    means — and the pane ids must reach the ink layer so it can aim at them.
 */
import { describe, expect, it } from 'vitest'
import {
  cardView, chartReceipt, chipIndicator, lessonPaneIds, samePaneIds, seriesRows,
} from '../src/client/ChartCard.js'
import { withLessonSeries } from '../src/client/market-client.js'
import type { ChartPayload } from '../src/client/payload.js'

const DAY = 86_400_000
const T0 = Date.parse('2026-10-01T00:00:00.000Z')
const bar = (i: number) => ({ time: new Date(T0 + i * DAY).toISOString(), open: 10, high: 12, low: 9, close: 11, volume: 1 })

function payload(n: number, annotations?: unknown[]): ChartPayload {
  return {
    kind: 'chart', version: 1, provider: 'binance', symbol: 'ETHUSDT',
    timeframes: [
      { timeframe: '1d', candles: Array.from({ length: n }, (_, i) => bar(i)), ...(annotations ? { annotations } : {}) },
      { timeframe: '4h', candles: Array.from({ length: 3 }, (_, i) => bar(i)) },
    ],
    annotations: [], scenarios: [],
  } as unknown as ChartPayload
}

describe('cardView', () => {
  it('shows the chart when the column is closed, whatever expanded says', () => {
    expect(cardView(false, false)).toBe('chart')
    expect(cardView(false, true)).toBe('chart')
  })

  it('collapses to a receipt while the column is open', () => {
    expect(cardView(true, false)).toBe('receipt')
  })

  it('lets the reader expand a receipt back into the full chart', () => {
    expect(cardView(true, true)).toBe('chart')
  })
})

describe('chartReceipt', () => {
  it('names the tool, instrument, timeframes and bar count of the first timeframe', () => {
    expect(chartReceipt('get_ohlcv', payload(120))).toBe('get_ohlcv · ETHUSDT 1d · 4h · 120 根K线')
  })

  it('adds the number of marks across timeframes when there are any', () => {
    const p = payload(50, [{ type: 'level' }, { type: 'zone' }])
    expect(chartReceipt('annotate_chart', p)).toBe('annotate_chart · ETHUSDT 1d · 4h · 50 根K线 · 2 条标注')
  })

  it('does not throw on a payload with no timeframes', () => {
    const p = { kind: 'chart', version: 1, provider: 'x', symbol: 'AAA', timeframes: [], annotations: [], scenarios: [] } as unknown as ChartPayload
    expect(chartReceipt('market_snapshot', p)).toBe('market_snapshot · AAA · 0 根K线')
  })
})

describe('chipIndicator', () => {
  it("maps the reader's rsi chip to the RSI grid", () => {
    const ind = chipIndicator('rsi', false)
    expect(ind?.name).toBe('RSI_GRID')
    expect(ind?.builtIn).toBe(true)
  })

  it('maps a walkthrough-forced rsi to the single-line TM_RSI over the rsi14 column', () => {
    const ind = chipIndicator('rsi', true)
    expect(ind).toEqual({ name: 'TM_RSI', figures: { rsi: 'rsi14' } })
  })

  it('leaves the other lesson panes on their own definitions', () => {
    expect(chipIndicator('macd', true)?.name).toBe('TM_MACD')
    expect(chipIndicator('stoch', true)?.name).toBe('TM_STOCH')
    expect(chipIndicator('adx', true)?.name).toBe('TM_ADX')
    expect(chipIndicator('mfi', true)?.name).toBe('TM_MFI')
    expect(chipIndicator('macd', false)?.name).toBe('TM_MACD')
  })

  it('knows no indicator for an unknown chip', () => {
    expect(chipIndicator('nope', true)).toBeUndefined()
  })

  it("feeds the forced RSI exactly the values the section's rsi14 column carried, by bar time", () => {
    // The section read bars 2..4; the live series has 6 bars.
    const merged = withLessonSeries(payload(6), { t: [2, 3, 4].map(i => T0 + i * DAY), cols: { rsi14: [31, 42, 53] } })
    const rows = seriesRows(merged.timeframes[0]!, chipIndicator('rsi', true)!.figures)
    expect(rows.map(r => r.rsi)).toEqual([undefined, undefined, 31, 42, 53, undefined])
  })
})

describe('lessonPaneIds', () => {
  it('records the volume pane and each chip pane, never the price pane', () => {
    const mounted = new Map([['rsi', 'pane_rsi'], ['bb', 'candle_pane'], ['macd', 'pane_macd']])
    expect(lessonPaneIds(mounted, 'pane_vol')).toEqual({ volume: 'pane_vol', rsi: 'pane_rsi', macd: 'pane_macd' })
  })

  it('omits the volume pane when the reader has it hidden', () => {
    expect(lessonPaneIds(new Map([['adx', 'pane_adx']]), undefined)).toEqual({ adx: 'pane_adx' })
  })
})

describe('samePaneIds', () => {
  it('is true for equal contents so the ink layer is not repainted for nothing', () => {
    expect(samePaneIds({ volume: 'pane_vol', rsi: 'pane_rsi' }, { rsi: 'pane_rsi', volume: 'pane_vol' })).toBe(true)
  })

  it('is false when a pane appears, goes, or moves', () => {
    expect(samePaneIds({ rsi: 'pane_rsi' }, {})).toBe(false)
    expect(samePaneIds({}, { rsi: 'pane_rsi' })).toBe(false)
    expect(samePaneIds({ rsi: 'pane_rsi' }, { rsi: 'pane_other' })).toBe(false)
  })
})
