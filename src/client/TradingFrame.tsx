/**
 * The trading shell frame — aligned with DSH 0.2.3-alpha.2 `AppFrame`.
 *
 * Four columns: sidebar | chart | main(keyed) | rightbar, plus shell.bottom,
 * shell.leading, and shell.overlay.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  computeColumns,
  RIGHTBAR_DEFAULT_RATIO,
  SIDEBAR_AUTO_COLLAPSE,
  SIDEBAR_COLLAPSED,
  SIDEBAR_DEFAULT,
  SIDEBAR_DRAWER_BREAKPOINT,
} from './columns.js'
import { DocumentTitle } from './DocumentTitle.js'
import { styles } from './styles.js'

export type TradingFrameProps = Record<string, any>

function CenterColumn(props: { children: ReactNode; inert: boolean }) {
  return <div className={styles.centerCol} {...{ inert: props.inert ? '' : undefined }}>{props.children}</div>
}

function ChartColumn(props: { children: ReactNode; inert: boolean }) {
  return <div className={styles.chartCol} {...{ inert: props.inert ? '' : undefined }}>{props.children}</div>
}

function ChartPlaceholder() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4 }}>
      Register a component into the <code>trading.chart</code> slot to fill it.
    </div>
  )
}

function RightbarColumn(props: { children: ReactNode; inert: boolean }) {
  return <div className={styles.detailsCol} data-rightbar-col {...{ inert: props.inert ? '' : undefined }}>{props.children}</div>
}

function MainPanel({ usePanelInfo, renderSlot }: {
  usePanelInfo?: <T>(select: (info: { activePanelId: string | null }) => T) => T
  renderSlot: TradingFrameProps['renderSlot']
}) {
  const activePanelId = usePanelInfo?.((info: { activePanelId: string | null }) => info.activePanelId) ?? null
  return (
    <div className={styles.mainPanel} data-global-panel={activePanelId !== null || undefined}>
      {renderSlot('main', {}, { entryKey: activePanelId ?? 'conversation' })}
    </div>
  )
}

function DragHandle(props: {
  side: 'sidebar' | 'chart' | 'details'
  left: number
  onStart: () => void
  onDrag: (dx: number) => void
  onEnd: () => void
}) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const capture = useRef<{ element: HTMLDivElement; id: number } | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const endDrag = useCallback(() => {
    const active = capture.current
    if (active === null) return
    capture.current = null
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    if (active.element.hasPointerCapture(active.id)) {
      active.element.releasePointerCapture(active.id)
    }
    setDragging(false)
    callbacks.current.onEnd()
  }, [])

  useEffect(() => endDrag, [endDrag])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || capture.current !== null) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    capture.current = { element: e.currentTarget, id: e.pointerId }
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id !== e.pointerId) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id !== e.pointerId) return
    callbacks.current.onDrag(e.clientX - origin.current)
    endDrag()
  }, [endDrag])

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (capture.current?.id === e.pointerId) endDrag()
  }, [endDrag])

  return (
    <div
      className={styles.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
    />
  )
}

export function TradingFrame({
  useStore,
  useSessions,
  usePanelInfo,
  useFoldedLandscape,
  actions,
  renderSlot,
  t,
}: TradingFrameProps) {
  const panels = useStore((s: any) => s)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const viewport: number = panels.viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1280)
  const foldedLandscape: boolean = useFoldedLandscape?.((matches: boolean) => matches) ?? false

  useLayoutEffect(() => {
    const el = frameRef.current
    if (el === null) return
    let raf: number | null = null
    let disposed = false
    const measure = () => {
      const width = el.getBoundingClientRect().width
      if (width > 0) actions.setViewportWidth(width)
    }
    measure()
    const observer = new ResizeObserver(() => {
      if (disposed) return
      raf ??= requestAnimationFrame(() => {
        raf = null
        measure()
      })
    })
    observer.observe(el)
    return () => {
      disposed = true
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [actions])

  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  useEffect(() => { actions.setNarrow(narrow) }, [actions, narrow])

  const [hostChrome, setHostChrome] = useState(() => ({
    windowsTitlebar: typeof document !== 'undefined' && document.documentElement.hasAttribute('data-windows-titlebar'),
    darwin: typeof document !== 'undefined' && document.documentElement.dataset['platform'] === 'darwin',
  }))
  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return
    const rootEl = document.documentElement
    const sync = () => setHostChrome(prev => {
      const windowsTitlebar = rootEl.hasAttribute('data-windows-titlebar')
      const darwin = rootEl.dataset['platform'] === 'darwin'
      return prev.windowsTitlebar === windowsTitlebar && prev.darwin === darwin ? prev : { windowsTitlebar, darwin }
    })
    sync()
    const obs = new MutationObserver(sync)
    obs.observe(rootEl, { attributes: true, attributeFilter: ['data-windows-titlebar', 'data-platform'] })
    return () => obs.disconnect()
  }, [])
  const { windowsTitlebar, darwin } = hostChrome
  const drawer = viewport < SIDEBAR_DRAWER_BREAKPOINT && !windowsTitlebar
  const centeredSidebar = foldedLandscape && viewport >= SIDEBAR_DRAWER_BREAKPOINT
  const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0
  const drawerOpen = drawer && !sidebarCollapsed

  const [sidebarTransition, setSidebarTransition] = useState({ drawer, collapsed: sidebarCollapsed, instant: true })
  if (sidebarTransition.drawer !== drawer || sidebarTransition.collapsed !== sidebarCollapsed) {
    setSidebarTransition({
      drawer,
      collapsed: sidebarCollapsed,
      instant: drawer && sidebarCollapsed && sidebarTransition.collapsed,
    })
  }

  const sidebarPreference = sidebarCollapsed
    ? 0
    : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
  const rightbarPreference = panels.rightbar ?? viewport * RIGHTBAR_DEFAULT_RATIO
  const collapsedWidth = drawer || darwin || windowsTitlebar ? 0 : SIDEBAR_COLLAPSED

  const normal = computeColumns(
    viewport,
    !panels.rightbarShown && narrow ? 0 : sidebarPreference,
    panels.chart,
    panels.rightbarShown ? rightbarPreference : 0,
    collapsedWidth,
    centeredSidebar,
  )
  const cols = computeColumns(
    viewport,
    drawer ? 0 : sidebarPreference,
    panels.chart,
    panels.rightbarTrack ? rightbarPreference : 0,
    collapsedWidth,
    centeredSidebar,
  )

  const colsRef = useRef(cols)
  colsRef.current = cols
  const rightbarWidthRef = useRef(normal.details)
  rightbarWidthRef.current = normal.details

  const sidebarBase = useRef(0)
  const chartBase = useRef(0)
  const rightbarBase = useRef(0)
  const [dragging, setDragging] = useState(false)

  const [animating, setAnimating] = useState(0)
  const trackToggle = `${sidebarCollapsed}:${Boolean(panels.rightbarTrack)}:${centeredSidebar}:${cols.chart > 0}`
  const previousToggle = useRef(trackToggle)
  const previousViewport = useRef(viewport)
  const animateTracks = previousViewport.current === viewport && (animating > 0 || previousToggle.current !== trackToggle)

  useLayoutEffect(() => {
    const viewportChanged = previousViewport.current !== viewport
    previousViewport.current = viewport
    if (viewportChanged) {
      previousToggle.current = trackToggle
      setAnimating(0)
      return
    }
    if (previousToggle.current === trackToggle) return
    previousToggle.current = trackToggle
    setAnimating(token => token + 1)
  }, [trackToggle, viewport])

  useEffect(() => {
    if (animating === 0) return
    const frame = frameRef.current
    if (frame === null) return
    const settle = () => setAnimating(0)
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === frame && event.propertyName === 'grid-template-columns') settle()
    }
    frame.addEventListener('transitionend', onTransitionEnd)
    const timer = setTimeout(settle, 600)
    return () => {
      frame.removeEventListener('transitionend', onTransitionEnd)
      clearTimeout(timer)
    }
  }, [animating])

  const onDragEnd = useCallback(() => setDragging(false), [])
  const onSidebarStart = useCallback(() => { sidebarBase.current = colsRef.current.sidebar; setDragging(true) }, [])
  const onChartStart = useCallback(() => { chartBase.current = colsRef.current.chart; setDragging(true) }, [])
  const onRightbarStart = useCallback(() => { rightbarBase.current = rightbarWidthRef.current; setDragging(true) }, [])
  const onSidebarDrag = useCallback((dx: number) => actions.setSidebar(sidebarBase.current + dx), [actions])
  const onChartDrag = useCallback((dx: number) => {
    const c = colsRef.current
    const room = c.chart + c.center
    if (room > 0) actions.setChart((chartBase.current + dx) / room)
  }, [actions])
  const onRightbarDrag = useCallback((dx: number) => actions.setRightbar(rightbarBase.current - dx), [actions])

  const runtimeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const productTitle = runtimeEnv?.['DSH_CLIENT_TITLE']
    ?? t?.('brand.localBuild')
    ?? 'DeepSeek Harness'

  const sidebarWidth = drawer
    ? Math.min(panels.sidebar || SIDEBAR_DEFAULT, Math.max(0, viewport - 48))
    : cols.sidebar

  const sidebar = useMemo(
    () => renderSlot('sidebar', { collapsed: sidebarCollapsed, width: sidebarWidth, drawer }),
    [renderSlot, sidebarCollapsed, sidebarWidth, drawer],
  )
  const main = useMemo(
    () => <MainPanel usePanelInfo={usePanelInfo} renderSlot={renderSlot} />,
    [usePanelInfo, renderSlot],
  )
  const rightbar = useMemo(
    () => renderSlot('rightbar', { width: normal.details, viewportWidth: viewport, canShow: normal.details > 0 }),
    [renderSlot, normal.details, viewport],
  )
  const overlays = useMemo(() => renderSlot('shell.overlay', {}), [renderSlot])
  const leading = useMemo(() => renderSlot('shell.leading', {}), [renderSlot])
  const leadingMounted = drawer || (darwin && sidebarCollapsed)

  return (
    <div
      ref={frameRef}
      className={styles.frame}
      style={{
        ...(windowsTitlebar ? { '--dsh-windows-sidebar-width': `${cols.sidebar}px` } as Record<string, string> : {}),
        gridTemplateColumns: `${cols.sidebar}px ${cols.chart}px minmax(0, 1fr) ${cols.details}px`,
      }}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-sidebar-drawer={drawer || undefined}
      data-sidebar-instant={(drawer && sidebarCollapsed && sidebarTransition.instant) || undefined}
      data-chart-collapsed={cols.chart === 0 || undefined}
      data-details-collapsed={cols.details === 0 || undefined}
      data-rightbar-collapsed={cols.details === 0 || undefined}
      data-rightbar-fullscreen={panels.rightbarFullscreen || undefined}
      data-rightbar-instant={panels.rightbarInstant || undefined}
      data-dragging={dragging || undefined}
      data-animating={animateTracks || undefined}
    >
      <DocumentTitle
        productTitle={productTitle}
        useSessions={useSessions}
        usePanelInfo={usePanelInfo}
      />
      {drawer && (
        <div
          className={styles.drawerMask}
          data-sidebar-mask
          aria-hidden="true"
          onClick={drawerOpen ? () => { actions.toggleSidebar() } : undefined}
        />
      )}
      <div
        className={styles.sidebarCol}
        style={drawer ? { width: sidebarWidth } : undefined}
        {...{ inert: drawer && sidebarCollapsed ? '' : undefined }}
      >
        {sidebar}
      </div>
      <ChartColumn inert={drawerOpen}>
        {renderSlot('trading.chart', { width: cols.chart }, { fallback: <ChartPlaceholder /> })}
      </ChartColumn>
      <>
        <CenterColumn inert={drawerOpen}>{main}</CenterColumn>
        <RightbarColumn inert={drawerOpen}>{rightbar}</RightbarColumn>
      </>
      <div className={styles.bottomRow} data-shell-bottom {...{ inert: drawerOpen ? '' : undefined }}>
        {renderSlot('shell.bottom', {})}
      </div>
      <div className={styles.overlayLayer} data-shell-overlay>
        {overlays}
      </div>
      {leadingMounted && (
        <div className={styles.leadingSeat} data-shell-leading {...{ inert: drawerOpen ? '' : undefined }}>
          {leading}
        </div>
      )}
      {!drawer && !centeredSidebar && !sidebarCollapsed && (
        <DragHandle
          side="sidebar"
          left={cols.sidebar}
          onStart={onSidebarStart}
          onDrag={onSidebarDrag}
          onEnd={onDragEnd}
        />
      )}
      {cols.chart > 0 && (
        <DragHandle
          side="chart"
          left={cols.sidebar + cols.chart}
          onStart={onChartStart}
          onDrag={onChartDrag}
          onEnd={onDragEnd}
        />
      )}
      {panels.rightbarShown && !panels.rightbarFullscreen && normal.details > 0 && (
        <DragHandle
          side="details"
          left={viewport - normal.details}
          onStart={onRightbarStart}
          onDrag={onRightbarDrag}
          onEnd={onDragEnd}
        />
      )}
    </div>
  )
}
