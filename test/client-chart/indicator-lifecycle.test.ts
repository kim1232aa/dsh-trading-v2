import { describe, expect, it } from 'vitest'
import type { Chart, Indicator, IndicatorCreate } from 'klinecharts'
import { overrideIndicator, syncIndicatorInPane } from '../../src/client/kline-v10.js'

// The canvas engine is the external boundary: retain its mounted instances and
// count recalculation requests, rather than replacing the lifecycle under test.
function engine(cloneInputs = false) {
  const copy = (value: IndicatorCreate): IndicatorCreate => cloneInputs ? structuredClone(value) : value
  const mounted: IndicatorCreate[] = []
  let recalcs = 0
  const chart = {
    getIndicators: (filter: { paneId?: string; name?: string }) => mounted.filter(i =>
      (!filter.paneId || i.paneId === filter.paneId) && (!filter.name || i.name === filter.name)),
    createIndicator: (value: IndicatorCreate) => { mounted.push(copy(value)); recalcs++; return value.paneId! },
    overrideIndicator: (value: IndicatorCreate) => {
      const current = mounted.find(i => i.name === value.name && i.paneId === value.paneId)
      if (!current) return false
      Object.assign(current, copy(value)); recalcs++; return true
    },
    removeIndicator: (filter: { paneId: string; name: string }) => {
      const i = mounted.findIndex(x => x.paneId === filter.paneId && x.name === filter.name)
      if (i < 0) return false
      mounted.splice(i, 1); return true
    },
    setPaneOptions: () => {},
  } as unknown as Chart
  return { chart, mounted, get recalcs() { return recalcs } }
}

const pane = { paneId: 'candle_pane', isStack: true }

describe('indicator lifecycle work budget', () => {
  it('does not submit unchanged calc inputs on unrelated data refreshes', () => {
    const e = engine()
    const history = [{ value: 1 }]
    e.chart.createIndicator({ name: 'TEST', paneId: pane.paneId, calcParams: [4], extendData: history })
    for (let i = 0; i < 20; i++) overrideIndicator(e.chart, { name: 'TEST', calcParams: [4], extendData: history }, pane.paneId)
    expect(e.recalcs).toBe(1)
    overrideIndicator(e.chart, { name: 'TEST', calcParams: [5], extendData: history }, pane.paneId)
    expect(e.recalcs).toBe(2)
    overrideIndicator(e.chart, { name: 'TEST', calcParams: [5], extendData: [{ value: 2 }] }, pane.paneId)
    expect(e.recalcs).toBe(3)
  })

  it('retains input identity when the real engine clones history arrays', () => {
    const e = engine(true)
    const history = [{ value: 1 }]
    syncIndicatorInPane(e.chart, { name: 'TEST', calcParams: [4], extendData: history }, true, pane)
    expect(e.mounted[0]?.extendData).not.toBe(history)
    for (let i = 0; i < 20; i++) {
      syncIndicatorInPane(e.chart, { name: 'TEST', calcParams: [4], extendData: history }, true, pane)
    }
    expect(e.recalcs).toBe(1)
    const changed = [{ value: 2 }]
    syncIndicatorInPane(e.chart, { name: 'TEST', calcParams: [4], extendData: changed }, true, pane)
    syncIndicatorInPane(e.chart, { name: 'TEST', calcParams: [4], extendData: changed }, true, pane)
    expect(e.recalcs).toBe(2)
    syncIndicatorInPane(e.chart, { name: 'TEST', calcParams: [4], extendData: changed }, false, pane)
    syncIndicatorInPane(e.chart, { name: 'TEST', calcParams: [4], extendData: changed }, true, pane)
    expect(e.recalcs).toBe(3)
  })

  it('hidden indicators are absent, and re-enabling uses the newest parameters', () => {
    const e = engine()
    syncIndicatorInPane(e.chart, { name: 'NW_TREND', calcParams: [8] }, false, pane)
    expect(e.mounted).toHaveLength(0)
    syncIndicatorInPane(e.chart, { name: 'NW_TREND', calcParams: [9] }, true, pane)
    expect(e.mounted[0]?.calcParams).toEqual([9])
    syncIndicatorInPane(e.chart, { name: 'NW_TREND', calcParams: [9] }, false, pane)
    expect(e.mounted).toHaveLength(0)
    syncIndicatorInPane(e.chart, { name: 'NW_TREND', calcParams: [12] }, true, pane)
    expect(e.mounted[0]?.calcParams).toEqual([12])
  })

  it('equal small theme records skip recalculation but changed themes do not', () => {
    const e = engine()
    syncIndicatorInPane(e.chart, { name: 'TEST', calcParams: [4], extendData: { dark: true } }, true, pane)
    syncIndicatorInPane(e.chart, { name: 'TEST', calcParams: [4], extendData: { dark: true } }, true, pane)
    expect(e.recalcs).toBe(1)
    syncIndicatorInPane(e.chart, { name: 'TEST', calcParams: [4], extendData: { dark: false } }, true, pane)
    expect(e.recalcs).toBe(2)
  })

  it('sibling panes are not removed by a same-named lifecycle update', () => {
    const e = engine()
    syncIndicatorInPane(e.chart, { name: 'TEST' }, true, { paneId: 'pane_a', height: 72 })
    syncIndicatorInPane(e.chart, { name: 'TEST' }, true, { paneId: 'pane_b', height: 72 })
    syncIndicatorInPane(e.chart, { name: 'TEST' }, false, { paneId: 'pane_a' })
    expect(e.mounted.map(i => i.paneId)).toEqual(['pane_b'])
  })
})
