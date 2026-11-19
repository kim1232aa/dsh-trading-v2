import { describe, expect, it } from 'vitest'
import { fitAverages, restoreAverages } from '../src/client/lesson-averages.js'

type Params = Record<string, number[]>

/** A chart with just the two calls the helper may make, backed by a plain table of calcParams. */
function fakeChart(table: Params) {
  const calls: Array<{ name: string; calcParams?: number[]; paneId?: string }> = []
  const chart = {
    getIndicators: (f: { paneId?: string; name?: string }) =>
      Object.entries(table)
        .filter(([name]) => f.name === undefined || f.name === name)
        .map(([name, calcParams]) => ({ name, paneId: 'candle_pane', calcParams: [...calcParams] })),
    overrideIndicator: (o: { name: string; calcParams?: number[]; paneId?: string }) => {
      calls.push(o)
      if (o.calcParams !== undefined) table[o.name] = [...o.calcParams]
      return true
    },
  }
  return { chart: chart as never, calls, table }
}

describe('lesson averages', () => {
  it('only touches averages that exist on the candle pane', () => {
    const { chart, calls, table } = fakeChart({ WMA: [60, 100, 200] })
    fitAverages(chart, [20, 50])
    expect(table).toEqual({ WMA: [20, 50] })
    expect(calls.map(c => c.name)).toEqual(['WMA'])
    expect(calls.every(c => c.paneId === 'candle_pane')).toBe(true)
  })

  it('fits both MA and WMA when both are mounted', () => {
    const { chart, table } = fakeChart({ MA: [20, 50, 200], WMA: [60, 100, 200] })
    fitAverages(chart, [20, 50])
    expect(table).toEqual({ MA: [20, 50], WMA: [20, 50] })
  })

  it('puts back the reader\'s own settings, then stays quiet', () => {
    const { chart, calls, table } = fakeChart({ WMA: [60, 100, 200] })
    fitAverages(chart, [20, 50])
    restoreAverages(chart)
    expect(table).toEqual({ WMA: [60, 100, 200] })
    const before = calls.length
    restoreAverages(chart)
    expect(calls.length).toBe(before)
  })

  it('remembers the first original, not an intermediate fit', () => {
    const { chart, table } = fakeChart({ WMA: [60, 100, 200] })
    fitAverages(chart, [20, 50])
    fitAverages(chart, [20, 50, 200])
    expect(table).toEqual({ WMA: [20, 50, 200] })
    restoreAverages(chart)
    expect(table).toEqual({ WMA: [60, 100, 200] })
  })

  it('does nothing when there was nothing to fit or restore', () => {
    const { chart, calls } = fakeChart({ WMA: [60, 100, 200] })
    restoreAverages(chart)
    fitAverages(chart, [])
    fitAverages(chart, [Number.NaN, -3, 0])
    expect(calls).toEqual([])
  })

  it('leaves a chart without any average alone', () => {
    const { chart, calls } = fakeChart({ SUPERTREND: [60, 4] })
    fitAverages(chart, [20, 50])
    restoreAverages(chart)
    expect(calls).toEqual([])
  })

  it('does not restore an average the reader removed meanwhile', () => {
    const { chart, calls, table } = fakeChart({ WMA: [60, 100, 200] })
    fitAverages(chart, [20, 50])
    delete table.WMA
    const before = calls.length
    restoreAverages(chart)
    expect(calls.length).toBe(before)
  })

  it('keeps the periods the reader chose during the lesson', () => {
    const { chart, table } = fakeChart({ WMA: [60, 100, 200] })
    fitAverages(chart, [20, 50])
    table.WMA = [10, 30]
    restoreAverages(chart)
    expect(table).toEqual({ WMA: [10, 30] })
  })

  it('treats periods changed mid-lesson as the new original on the next fit', () => {
    const { chart, table } = fakeChart({ WMA: [60, 100, 200] })
    fitAverages(chart, [20, 50])
    table.WMA = [10, 30]
    fitAverages(chart, [20, 50, 200])
    restoreAverages(chart)
    expect(table).toEqual({ WMA: [10, 30] })
  })
})
