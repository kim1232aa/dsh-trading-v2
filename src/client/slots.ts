/**
 * Slot contract of the trading frame — aligned with DSH 0.2.3-alpha.2 `ui-layout`.
 */
import type { ReactNode } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar': {
      kind: 'single'
      scope: 'root'
      owner: SidebarOwnerProps
    }
    /** Keyed panel slot. ui-conversation registers key "conversation". */
    'main': {
      kind: 'keyed'
      scope: 'root'
    }
    /** Right sidebar panel. ui-sidebar-right fills it. */
    'rightbar': {
      kind: 'single'
      scope: 'root'
      owner: RightbarOwnerProps
    }
    'shell.bottom': {
      kind: 'single'
      scope: 'root'
    }
    'shell.overlay': {
      kind: 'list'
      scope: 'root'
    }
    'shell.leading': {
      kind: 'single'
      scope: 'root'
    }
    /**
     * The persistent chart column — the one seat with no stock counterpart.
     */
    'trading.chart': {
      kind: 'single'
      scope: 'session-maybe'
      owner: ChartOwnerProps
    }
  }
}

/** Chart owner share: live column width from the frame's concession solve. */
export interface ChartOwnerProps {
  width: number
}

/** Sidebar owner share: column state from the frame's concession solve. */
export interface SidebarOwnerProps {
  collapsed: boolean
  width: number
  drawer: boolean
}

/** Rightbar owner share: resolved normal geometry and opening eligibility. */
export interface RightbarOwnerProps {
  width: number
  viewportWidth: number
  canShow: boolean
}

/** Keeps this a module under `isolatedModules`. */
export type FrameSlotChildren = ReactNode
