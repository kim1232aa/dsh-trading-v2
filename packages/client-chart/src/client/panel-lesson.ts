/**
 * The decisions behind the chart column's walkthrough linkage, kept pure so
 * they can be tested without a DOM: ChartPanel wires effects and state, this
 * module says what they should do.
 */
import { isSameInstrument, readSymbolCandidates } from './symbols.js'

/** Symbols compare case- and whitespace-insensitively across tools and providers. */
export function sameSymbol(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase()
}

/** The series a lesson board is drawn on. */
export interface BoardSeries {
  provider: string
  symbol: string
  timeframe: string
}

/** The series the panel currently shows as its own. */
export interface OwnSeries {
  provider: string
  symbol: string
  timeframes: readonly { timeframe: string }[]
}

/**
 * The lesson may draw only on the exact series it was written about: a board
 * placed on a different symbol, interval or provider would put marks at prices
 * that mean nothing there.
 */
export function lessonActive(own: OwnSeries | null, board: BoardSeries | null): boolean {
  if (board === null || own === null) return false
  const tf = own.timeframes[0]?.timeframe
  return tf !== undefined
    && own.provider === board.provider
    && sameSymbol(own.symbol, board.symbol)
    && tf === board.timeframe
}

/**
 * Indicator chips the chart must show. `undefined` leaves the choice to the
 * reader; during a lesson the section decides, so a section about RSI shows
 * RSI and nothing the reader happened to leave on.
 */
export function lessonChips(lessonOn: boolean, board: { pane?: string | undefined } | null): string[] | undefined {
  if (!lessonOn) return undefined
  return board?.pane !== undefined ? [board.pane] : []
}

/** The wording of the column's lesson pill. */
export function lessonLabel(
  snap: { mode: string; look: boolean; section: string | null },
  chartReady: boolean,
): string {
  const mode = snap.mode === 'live'
    ? '讲解中'
    : snap.mode === 'paused'
      ? (snap.look ? '等你' : '已暂停')
      : snap.mode === 'replay'
        ? '回看中'
        : '讲解'
  return mode + (snap.section !== null && snap.section !== '' ? ` · ${snap.section}` : '') + (chartReady ? '' : ' · 加载中')
}

export type BoardTarget =
  | { action: 'none'; clearReader?: true }
  | { action: 'load'; symbol: string; timeframe: string; provider: string; clearReader?: true }

/**
 * What the panel must do to put the board's series on screen.
 * @param board - the series the section is about.
 * @param own - what the panel shows now.
 * @param failed - "symbol|timeframe" the provider already refused, so the
 *   panel does not refetch it on every tick.
 * @param reader - a symbol the reader named; the conversation has not caught up
 *   with it yet, so a board about something else must not override it.
 */
export function boardTarget(
  board: BoardSeries | null,
  own: { symbol: string; provider: string; timeframe: string | undefined } | null,
  failed: string | null,
  reader: string | null,
): BoardTarget {
  if (board === null) return { action: 'none' }
  let agrees = false
  if (reader !== null) {
    if (!sameSymbol(reader, board.symbol)) return { action: 'none' }
    agrees = true
  }
  const clear = agrees ? { clearReader: true as const } : {}
  if (
    own !== null
    && sameSymbol(own.symbol, board.symbol)
    && own.provider === board.provider
    && own.timeframe === board.timeframe
  ) return { action: 'none', ...clear }
  if (failed === `${board.symbol}|${board.timeframe}`) return { action: 'none' }
  return { action: 'load', symbol: board.symbol, timeframe: board.timeframe, provider: board.provider, ...clear }
}

/** One search hit, in the shape the market client returns. */
export interface AskedHit {
  symbol: string
  name?: string | undefined
  providerId?: string | undefined
}

export interface AskedTarget {
  symbol: string
  providerId?: string | undefined
}

/**
 * Turn what the reader just said into an instrument to open: a ticker as it
 * stands, a name through search (first hit for free text, the same instrument
 * for a lower-case word). A failing lookup is never an error here: asking a
 * question must not break the chart.
 */
export async function resolveAsked(
  text: string,
  search: (query: string) => Promise<readonly AskedHit[] | undefined>,
): Promise<AskedTarget | undefined> {
  for (const candidate of readSymbolCandidates(text)) {
    if (candidate.kind === 'symbol') return { symbol: candidate.value }
    let hits: readonly AskedHit[] | undefined
    try {
      hits = await search(candidate.value)
    } catch {
      continue
    }
    if (!Array.isArray(hits) || hits.length === 0) continue
    const hit = candidate.kind === 'text' ? hits[0] : hits.find(item => isSameInstrument(candidate.value, item))
    if (hit !== undefined) return { symbol: hit.symbol, providerId: hit.providerId }
  }
  return undefined
}
