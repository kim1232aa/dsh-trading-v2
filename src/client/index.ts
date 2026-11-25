/**
 * Unified browser entrypoint for `dsh-trading`:
 *  1. Registers `ChartCard` (`market_snapshot`, `get_ohlcv`, `annotate_chart`,
 *     `find_supply_demand_zones`) and `WalkthroughCard` (`walkthrough`) into `tool.call.toolview`.
 *  2. Registers `ChartPanel` into `trading.chart` over `ctx.connection.rpc`.
 *  3. When `theme` is mounted and `config.tradingFrame !== false`, mounts the
 *     chart-first `TradingFrame` shell (replaces stock `ui-layout`).
 */
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from './slots.js'
import { ChartCard } from './ChartCard.js'
import { ChartPanel } from './ChartPanel.js'
import { createSessionFeedObservable, sendReply } from './dsh-session.js'
import { mountTradingFrame } from './frame.js'
import { createMarketClient } from './market-client.js'
import { WalkthroughCard } from './WalkthroughCard.js'

export { registerAnnotationRenderer } from './ChartCard.js'
export type { AnnotationRenderer, AnnotationRendererContext, DrawPrimitive } from './ChartCard.js'
export type { ChartAnnotation, ChartPayload, ChartScenario, ChartTimeframeData } from './payload.js'
export { LayoutController } from './service.js'
export type { ILayout } from './service.js'
export type { ChartOwnerProps, RightbarOwnerProps, SidebarOwnerProps } from './slots.js'

export const name = 'dsh-trading'
export const inject = ['slots', 'connection']

const CHART_TOOLS = ['market_snapshot', 'get_ohlcv', 'annotate_chart', 'find_supply_demand_zones']

export interface ClientConfig {
  tradingFrame?: boolean | { get(): boolean } | undefined
}

function readTradingFrame(config: ClientConfig | undefined): boolean {
  const v = config?.tradingFrame
  if (typeof v === 'boolean') return v
  if (typeof v === 'object' && v !== null && typeof v.get === 'function') return Boolean(v.get())
  return true
}

export function apply(ctx: any, config: ClientConfig = {}): void {
  ctx.slots.inject('tool.call.toolview', () => [
    ...CHART_TOOLS.map(key =>
      ctx.slots.register(
        { name: 'tool.call.toolview', key, registrant: 'dsh-trading' },
        ChartCard,
      )),
    ctx.slots.register(
      {
        name: 'tool.call.toolview',
        key: 'walkthrough',
        registrant: 'dsh-trading',
        inject: (sessionId: string) => ({
          ask: (text: string) => { void sendReply(ctx, sessionId, text) },
          feed: createSessionFeedObservable(ctx, sessionId),
        }),
      },
      WalkthroughCard,
    ),
  ])

  const connection = ctx.get('connection') as ConnectionHandle
  const market = createMarketClient(connection.rpc)
  ctx.slots.inject('trading.chart', () => [
    ctx.slots.register(
      {
        name: 'trading.chart',
        registrant: 'dsh-trading',
        inject: (sessionId?: string) => ({
          market,
          ask: sessionId === undefined ? undefined : (text: string) => { void sendReply(ctx, sessionId, text) },
          feed: createSessionFeedObservable(ctx, sessionId),
        }),
      },
      ChartPanel,
    ),
  ])

  if (readTradingFrame(config)) {
    ctx.inject(['theme'], (frameCtx: any) => {
      mountTradingFrame(frameCtx)
    })
  }
}
