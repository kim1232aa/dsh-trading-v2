import type { ChartCandle, ChartPayload } from './payload.js'
import { mergeTail, withCandles } from './market-client.js'

export interface PanelSeriesData<T> { key: string; data: T }
export function panelSeriesKey(symbol: string | undefined, timeframe: string | undefined, provider?: string): string | null {
  return symbol && timeframe ? JSON.stringify([provider ?? null, symbol, timeframe]) : null
}
/** Keep cached data while paused, but never display it under another chart. */
export function dataForSeries<T>(value: PanelSeriesData<T> | null, key: string | null): T | null {
  return key !== null && value?.key === key ? value.data : null
}
/** A queued response must match the latest state, including the data provider. */
export function mergePanelTail(current: ChartPayload | null, key: string, tail: readonly ChartCandle[]): ChartPayload | null {
  if (current === null) return current
  const tf = current.timeframes[0]
  if (tf === undefined || panelSeriesKey(current.symbol, tf.timeframe, current.provider) !== key) return current
  return withCandles(current, mergeTail(tf.candles, tail))
}
