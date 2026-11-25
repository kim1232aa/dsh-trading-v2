/**
 * The root entry's transient layout store — aligned with DSH 0.2.3-alpha.2 ui-layout.
 */
import { defineStore } from '@deepseek-ai/dsh-client-store'
import {
  CHART_RATIO_DEFAULT,
  clampRatio,
  clampWidth,
  RIGHTBAR_DEFAULT_RATIO,
  RIGHTBAR_MAX_RATIO,
  RIGHTBAR_MIN,
  SIDEBAR_AUTO_COLLAPSE,
  SIDEBAR_DEFAULT,
  SIDEBAR_DRAWER_BREAKPOINT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
} from './columns.js'

type LayoutState = {
  panelInfo: { activePanelId: string | null }
  sidebar: number
  /** Chart share of the free width, 0 = closed. */
  chart: number
  narrow: boolean
  narrowExpanded: boolean
  viewportWidth: number
  rightbar: number | null
  rightbarShown: boolean
  rightbarTrack: boolean
  rightbarFullscreen: boolean
  rightbarInstant: boolean
}

export function createLayoutStore() {
  return defineStore({
    init: (): LayoutState => ({
      panelInfo: { activePanelId: null },
      sidebar: 0,
      chart: CHART_RATIO_DEFAULT,
      narrow: false,
      narrowExpanded: false,
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1280,
      rightbar: null,
      rightbarShown: false,
      rightbarTrack: false,
      rightbarFullscreen: false,
      rightbarInstant: false,
    }),
    actions: {
      setSidebar: (d: LayoutState, px: number) => {
        d.rightbarInstant = false
        d.sidebar = clampWidth(px, SIDEBAR_MIN, SIDEBAR_MAX)
      },
      setChart: (d: LayoutState, ratio: number) => {
        d.chart = clampRatio(ratio)
      },
      openChart: (d: LayoutState) => {
        if (d.chart === 0) d.chart = CHART_RATIO_DEFAULT
      },
      closeChart: (d: LayoutState) => {
        d.chart = 0
      },
      toggleChart: (d: LayoutState) => {
        d.chart = d.chart === 0 ? CHART_RATIO_DEFAULT : 0
      },
      toggleSidebar: (d: LayoutState) => {
        d.rightbarInstant = false
        if (d.narrow) d.narrowExpanded = !d.narrowExpanded
        else d.sidebar = d.sidebar === 0 ? SIDEBAR_DEFAULT : 0
      },
      setNarrow: (d: LayoutState, narrow: boolean) => {
        if (d.narrow === narrow) return
        d.narrow = narrow
        d.narrowExpanded = false
      },
      setViewportWidth: (d: LayoutState, width: number) => {
        if (d.viewportWidth === width) return
        d.rightbarInstant = false
        if (
          d.viewportWidth < SIDEBAR_AUTO_COLLAPSE !== width < SIDEBAR_AUTO_COLLAPSE
          || d.viewportWidth < SIDEBAR_DRAWER_BREAKPOINT !== width < SIDEBAR_DRAWER_BREAKPOINT
        ) {
          d.narrowExpanded = false
        }
        d.viewportWidth = width
      },
      selectPanel: (d: LayoutState, panelId: string | null) => {
        d.panelInfo.activePanelId = panelId
        if (d.viewportWidth < SIDEBAR_DRAWER_BREAKPOINT) d.narrowExpanded = false
      },
      retainMainPanels: (d: LayoutState, panelIds: string[]) => {
        if (d.panelInfo.activePanelId !== null && !panelIds.includes(d.panelInfo.activePanelId)) {
          d.panelInfo.activePanelId = null
        }
      },
      setRightbar: (d: LayoutState, px: number) => {
        d.rightbarInstant = false
        d.rightbar = clampWidth(px, RIGHTBAR_MIN, Math.max(RIGHTBAR_MIN, d.viewportWidth * RIGHTBAR_MAX_RATIO))
      },
      openRightbar: (d: LayoutState, track: boolean, fullscreen: boolean) => {
        if (!d.rightbarShown || d.rightbarTrack !== track || d.rightbarFullscreen !== fullscreen) {
          d.rightbarInstant = d.rightbarFullscreen && !fullscreen
        }
        if (!d.rightbarShown && d.viewportWidth < SIDEBAR_AUTO_COLLAPSE) d.narrowExpanded = false
        d.rightbar ??= Math.max(RIGHTBAR_MIN, Math.round(d.viewportWidth * RIGHTBAR_DEFAULT_RATIO))
        d.rightbarShown = true
        d.rightbarTrack = track
        d.rightbarFullscreen = fullscreen
      },
      closeRightbar: (d: LayoutState) => {
        if (d.rightbarShown) d.rightbarInstant = d.rightbarFullscreen
        d.rightbarShown = false
        d.rightbarTrack = false
        d.rightbarFullscreen = false
      },
    },
  })
}
