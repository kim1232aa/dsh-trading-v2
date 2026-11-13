/**
 * Near-viewport lifecycle for heavyweight chart cards in conversation history.
 * The persistent trading panel does not use this gate.
 */
export const CHART_CARD_ROOT_MARGIN = '1500px 0px'

/** Do not allocate a canvas before the first observer notification. */
export function initialChartMount(hasObserver: boolean): boolean {
  return !hasObserver
}

export interface ViewportTarget {
  getBoundingClientRect: () => { height: number }
}

export interface ViewportEntry {
  target: unknown
  isIntersecting: boolean
}

export interface ViewportObserver {
  observe: (target: unknown) => void
  disconnect: () => void
}

export type ViewportObserverFactory = (
  callback: (entries: ViewportEntry[]) => void,
  options: { root: null; rootMargin: string; threshold: number },
) => ViewportObserver

function browserObserverFactory(): ViewportObserverFactory | null {
  if (typeof IntersectionObserver === 'undefined') return null
  return (callback, options) => {
    const observer = new IntersectionObserver(entries => callback(entries), options)
    return {
      observe: target => observer.observe(target as Element),
      disconnect: () => observer.disconnect(),
    }
  }
}

/**
 * Observe a chart-card shell and report whether its expensive body should stay
 * mounted. The leaving notification includes the measured height so callers
 * can park a stable placeholder before React unmounts the chart.
 */
export function observeNearViewport(
  target: ViewportTarget,
  onChange: (near: boolean, parkedHeight?: number) => void,
  factory: ViewportObserverFactory | null = browserObserverFactory(),
): () => void {
  if (factory === null) {
    onChange(true)
    return () => {}
  }
  const observer = factory(entries => {
    for (const entry of entries) {
      if (entry.target !== target) continue
      if (entry.isIntersecting) onChange(true)
      else onChange(false, target.getBoundingClientRect().height)
    }
  }, { root: null, rootMargin: CHART_CARD_ROOT_MARGIN, threshold: 0 })
  observer.observe(target)
  return () => observer.disconnect()
}
