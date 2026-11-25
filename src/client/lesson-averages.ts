/**
 * Moving-average room for the lesson camera.
 *
 * A section frames a window of bars and says which averages are worth their
 * axis room. This fits the averages that are actually mounted on the candle
 * pane (the built-in MA, and this plugin's WMA) and puts the reader's own
 * periods back afterwards. It never creates an indicator, and it never
 * overwrites periods the reader changed while a lesson was running.
 * @module
 */
import type { Chart } from 'klinecharts'
import { hasIndicator, overrideIndicator } from './kline-v10.js'

const PANE = 'candle_pane'
const AVERAGES = ['MA', 'WMA'] as const

type Fit = { original: number[]; fitted: number[] }
const fits = new WeakMap<Chart, Map<string, Fit>>()

/** Periods a chart can draw: whole, positive, finite. */
function usable(periods: readonly number[]): number[] {
  return periods.filter(p => Number.isFinite(p) && p >= 1).map(Math.round)
}

function currentParams(chart: Chart, name: string): number[] | undefined {
  const ind = chart.getIndicators({ paneId: PANE, name })[0]
  return ind === undefined ? undefined : [...(ind.calcParams as number[])]
}

function same(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/** Fit the mounted averages to `periods`, remembering what the reader had. */
export function fitAverages(chart: Chart, periods: readonly number[]): void {
  const want = usable(periods)
  if (want.length === 0) return
  const table = fits.get(chart) ?? new Map<string, Fit>()
  fits.set(chart, table)
  for (const name of AVERAGES) {
    if (!hasIndicator(chart, PANE, name)) continue
    const now = currentParams(chart, name)
    if (now === undefined) continue
    const known = table.get(name)
    // First touch, or the reader changed the periods since our last fit: what is there now is theirs.
    const original = known !== undefined && same(known.fitted, now) ? known.original : now
    table.set(name, { original, fitted: want })
    overrideIndicator(chart, { name, calcParams: want }, PANE)
  }
}

/** Give back the periods the reader had, for every average we fitted and they have not touched since. */
export function restoreAverages(chart: Chart): void {
  const table = fits.get(chart)
  if (table === undefined) return
  fits.delete(chart)
  for (const [name, fit] of table) {
    if (!hasIndicator(chart, PANE, name)) continue
    const now = currentParams(chart, name)
    if (now === undefined || !same(now, fit.fitted)) continue
    overrideIndicator(chart, { name, calcParams: fit.original }, PANE)
  }
}
