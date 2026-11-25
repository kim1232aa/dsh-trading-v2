import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { ChartPanel } from '../../src/client/ChartPanel.js'
import * as ChartCardMod from '../../src/client/ChartCard.js'
import type { MarketClient } from '../../src/client/market-client.js'

function fakeMarket(): MarketClient {
  return {
    listSymbols: vi.fn(async () => ({ providerId: 'csv', description: 'CSV', symbols: [] })),
    search: vi.fn(async () => []),
    getPayload: vi.fn(async () => ({ kind: 'chart' as const, version: 1 as const, provider: 'csv', symbol: 'BTCUSDT', timeframes: [], scenarios: [] })),
    getTail: vi.fn(async () => []),
    getBefore: vi.fn(async () => []),
    publishView: vi.fn(),
    getDerivatives: vi.fn(async () => null),
    getCvd: vi.fn(async () => null),
    getMoneyFlow: vi.fn(async () => null),
    getOrderbook: vi.fn(async () => null),
    getLargeOrders: vi.fn(async () => null),
    getFundamentals: vi.fn(async () => null),
  }
}

function recordHooks(renderFn: () => unknown): string[] {
  const internals = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
  const dispatcher = internals.ReactCurrentDispatcher
  const prev = dispatcher.current
  const log: string[] = []
  dispatcher.current = {
    useState: (init: unknown) => {
      log.push('useState')
      return [typeof init === 'function' ? (init as () => unknown)() : init, () => {}]
    },
    useRef: (init: unknown) => {
      log.push('useRef')
      return { current: init }
    },
    useEffect: () => { log.push('useEffect') },
    useLayoutEffect: () => { log.push('useLayoutEffect') },
    useMemo: (fn: () => unknown) => {
      log.push('useMemo')
      return fn()
    },
    useCallback: (fn: unknown) => {
      log.push('useCallback')
      return fn
    },
    useSyncExternalStore: (_sub: unknown, getSnap: () => unknown) => {
      log.push('useSyncExternalStore')
      return getSnap()
    },
    useReducer: (_r: unknown, init: unknown) => {
      log.push('useReducer')
      return [init, () => {}]
    },
    useContext: () => { log.push('useContext'); return undefined },
    useId: () => { log.push('useId'); return 'id' },
  }
  try {
    renderFn()
  } finally {
    dispatcher.current = prev
  }
  return log
}

describe('ChartPanelInner hook stability & useDark app theme tracking', () => {
  it('calls the exact same sequence of React hooks at width=0 and width=800', () => {
    const market = fakeMarket()
    const el = ChartPanel({ width: 800, market })
    const Inner = (el as any).props.children.type as (props: any) => unknown
    const openHooks = recordHooks(() => Inner({ width: 800, market }))
    const closedHooks = recordHooks(() => Inner({ width: 0, market }))
    expect(closedHooks).toEqual(openHooks)
  })

  it('resolveDocumentDark prefers app theme attributes over OS media query', () => {
    const resolveDocumentDark = (ChartCardMod as Record<string, unknown>)['resolveDocumentDark'] as
      | ((doc: any, osDark: boolean) => boolean)
      | undefined
    expect(typeof resolveDocumentDark).toBe('function')

    const makeDoc = (darkAttr: boolean, source?: string) => ({
      documentElement: {
        getAttribute: (k: string) => (k === 'data-ds-theme-source' ? source ?? null : null),
      },
      body: {
        hasAttribute: (k: string) => (k === 'data-ds-dark-theme' ? darkAttr : false),
      },
    })

    // App forced dark while OS is light -> dark
    expect(resolveDocumentDark!(makeDoc(true, 'dark'), false)).toBe(true)
    // App forced light while OS is dark -> light
    expect(resolveDocumentDark!(makeDoc(false, 'light'), true)).toBe(false)
    // App in system mode tracks body attribute set by ThemePresenter
    expect(resolveDocumentDark!(makeDoc(true, 'system'), false)).toBe(true)
    // No app markers -> falls back to OS media query
    expect(resolveDocumentDark!(makeDoc(false, undefined), true)).toBe(true)
    expect(resolveDocumentDark!(makeDoc(false, undefined), false)).toBe(false)
  })
})
