/**
 * Column solver for the trading frame (four columns: sidebar | chart | center | details).
 * Chain order: shrink details -> close details -> shrink chart to floor ->
 * close chart -> let center absorb any remaining deficit.
 */

export const CENTER_MIN = 420
export const SIDEBAR_MIN = 264
export const SIDEBAR_MAX = 420
export const SIDEBAR_DEFAULT = 280
export const SIDEBAR_COLLAPSED = 56
export const SIDEBAR_DRAWER_BREAKPOINT = 768
export const SIDEBAR_AUTO_COLLAPSE = 1024

export const DETAILS_MIN = 300
export const DETAILS_MAX = 520
export const DETAILS_DEFAULT = 360

export const RIGHTBAR_MIN = DETAILS_MIN
export const RIGHTBAR_MAX_RATIO = 0.7
export const RIGHTBAR_DEFAULT_RATIO = 0.45

export const CHART_MIN = 420
export const CHART_RATIO_DEFAULT = 0.7
export const CHART_RATIO_MIN = 0.2
export const CHART_RATIO_MAX = 0.85

export interface Columns {
  sidebar: number
  chart: number
  center: number
  details: number
}

export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return CHART_RATIO_DEFAULT
  return Math.min(CHART_RATIO_MAX, Math.max(CHART_RATIO_MIN, ratio))
}

export function clampWidth(px: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(px)))
}

export function computeColumns(
  viewport: number,
  sidebar: number,
  chartRatio: number,
  details: number,
  collapsedWidth: number = SIDEBAR_COLLAPSED,
  centeredSidebar: boolean = false,
): Columns {
  const s = sidebar === 0
    ? collapsedWidth
    : centeredSidebar
      ? viewport / 2
      : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX)
  const detailsMax = Math.max(DETAILS_MAX, Math.round(viewport * RIGHTBAR_MAX_RATIO))
  const d0 = details === 0 ? 0 : clampWidth(details, DETAILS_MIN, detailsMax)

  const split = (detailsWidth: number): Columns | null => {
    const room = viewport - s - detailsWidth
    if (chartRatio === 0) {
      return room >= CENTER_MIN ? { sidebar: s, chart: 0, center: room, details: detailsWidth } : null
    }
    const ceiling = room - CENTER_MIN
    if (ceiling < CHART_MIN) return null
    const chart = Math.min(ceiling, Math.max(CHART_MIN, Math.round(room * clampRatio(chartRatio))))
    return { sidebar: s, chart, center: room - chart, details: detailsWidth }
  }

  return split(d0)
    ?? (d0 === 0 ? null : split(DETAILS_MIN))
    ?? split(0)
    ?? { sidebar: s, chart: 0, center: Math.max(0, viewport - s), details: 0 }
}
