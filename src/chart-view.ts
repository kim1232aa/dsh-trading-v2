/**
 * Host half of the chart-card & loopback RPC surface:
 * 1. Publishes the `/dsh-trading-market` loopback RPC channel when `connection`
 *    and `webServer` exist (web/desktop profiles).
 * 2. Bridges watchlist RPC calls into the unified WatchlistStore when mounted.
 * 3. Contributes the per-turn chart-panel context line (gated to trading/analyst
 *    agent presets) and registers the `get_chart_view` tool.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcHandler, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type { ChartView, MarketDataLike } from './market-rpc.js'
import { chartPanelContextText, ENDPOINTS, MARKET_CHANNEL, serveMarketEndpoint } from './market-rpc.js'
import { CoinglassCapi } from './providers/coinglass/index.js'
import type { CoinglassService } from './providers/coinglass/index.js'
import type { WatchlistStore } from './watchlist/store.js'

let sharedCoinglass: CoinglassCapi | undefined
const fallbackCoinglass = (): CoinglassCapi => (sharedCoinglass ??= new CoinglassCapi())

export {
  chartPanelContextText,
  CHART_CONTEXT_PRESETS,
  describeChartView,
  ENDPOINTS,
  MARKET_CHANNEL,
  MAX_PANEL_BARS,
  readChartView,
  readOhlcvRequest,
  resolveAgentPreset,
  serveMarketEndpoint,
} from './market-rpc.js'
export type { ChartView, DerivativesResponse, MarketDataLike, OhlcvRequest, OhlcvResponse, ProvidersResponse, SymbolsResponse } from './market-rpc.js'

const VIEW_TTL_MS = 30_000

export interface ChartHostOptions {
  watchlistStore?: WatchlistStore | undefined
}

export function applyChartHost(ctx: Context, options: ChartHostOptions = {}): void {
  let view: ChartView | undefined
  let viewAt = 0

  const liveView = (): ChartView | undefined =>
    view !== undefined && Date.now() - viewAt <= VIEW_TTL_MS ? view : undefined

  const withWatchlistBridge = (marketData: MarketDataLike): MarketDataLike => {
    const store = options.watchlistStore
    if (store === undefined) return marketData
    return {
      provider: id => marketData.provider(id),
      ...(marketData.resolveProvider ? { resolveProvider: (sym, id) => marketData.resolveProvider!(sym, id) } : {}),
      ...(marketData.searchWithProvider ? { searchWithProvider: (q, id) => marketData.searchWithProvider!(q, id) } : {}),
      ...(marketData.list ? { list: () => marketData.list!() } : {}),
      getWatchlist: async () => {
        const state = await store.readState()
        return {
          items: state.items.map(it => ({
            symbol: it.symbol,
            group: it.group,
            ...(it.notes !== undefined ? { notes: it.notes } : {}),
          })),
          groups: state.groups,
        }
      },
      addToWatchlist: async item => {
        if (!item.symbol) return false
        await store.addItem({ symbol: item.symbol, group: item.group, notes: item.notes })
        return true
      },
      removeFromWatchlist: async symbol => {
        if (!symbol) return false
        return store.removeItem(symbol)
      },
    }
  }

  const makeHandler = (marketData: MarketDataLike, coinglass?: CoinglassService): ConnectionRpcHandler => async (endpoint, payload) => {
    try {
      if (endpoint === ENDPOINTS.largeOrders) {
        const body = (typeof payload === 'object' && payload !== null) ? payload as Record<string, unknown> : {}
        const symbol = typeof body['symbol'] === 'string' ? body['symbol'].trim() : ''
        if (!symbol) throw new Error('symbol must be a non-empty string')
        const hours = typeof body['hours'] === 'number' && Number.isFinite(body['hours']) ? body['hours'] : 72
        const top = typeof body['top'] === 'number' && Number.isFinite(body['top']) ? Math.min(200, Math.max(1, Math.trunc(body['top']))) : 40
        const venue = typeof body['venue'] === 'string' ? body['venue'] : undefined
        const marketType: 'all' | 'spot' | 'perp' | undefined = body['marketType'] === 'spot' || body['marketType'] === 'perp' || body['marketType'] === 'all' ? body['marketType'] : undefined
        const currentPrice = typeof body['currentPrice'] === 'number' && Number.isFinite(body['currentPrice']) ? body['currentPrice'] : undefined
        const maxDistancePct = typeof body['maxDistancePct'] === 'number' && Number.isFinite(body['maxDistancePct']) ? body['maxDistancePct'] : undefined
        const minUsd = typeof body['minUsd'] === 'number' && Number.isFinite(body['minUsd']) ? body['minUsd'] : undefined
        const status: 'active' | 'all' | 'revoked' = body['status'] === 'all' || body['status'] === 'revoked' || body['status'] === 'active' ? body['status'] : 'active'
        const balanced = typeof body['balanced'] === 'boolean' ? body['balanced'] : true
        const num = (k: string): number | undefined =>
          typeof body[k] === 'number' && Number.isFinite(body[k]) && (body[k] as number) >= 0 ? body[k] as number : undefined
        const spotMinUsd = num('spotMinUsd')
        const spotTradesMinUsd = num('spotTradesMinUsd')
        const tradesMinUsd = typeof body['tradesMinUsd'] === 'number' && Number.isFinite(body['tradesMinUsd']) && body['tradesMinUsd'] > 0
          ? body['tradesMinUsd']
          : undefined

        if (coinglass && !coinglass.enabled) {
          return { ok: true, value: { symbol, cgSymbol: '', pair: '', orderCount: 0, walls: [] } }
        }
        const opts = {
          hours,
          top,
          status,
          balanced,
          statistics: false,
          ...(venue ? { venue } : {}),
          ...(marketType ? { marketType } : {}),
          ...(currentPrice !== undefined ? { currentPrice } : {}),
          ...(maxDistancePct !== undefined ? { maxDistancePct } : {}),
          ...(minUsd !== undefined ? { minUsd } : {}),
          ...(tradesMinUsd !== undefined ? { tradesMinUsd } : {}),
          ...(spotMinUsd !== undefined ? { spotMinUsd } : {}),
          ...(spotTradesMinUsd !== undefined ? { spotTradesMinUsd } : {}),
        }
        const snap = await (coinglass ? coinglass.getLargeOrders(symbol, opts) : fallbackCoinglass().getLargeOrders(symbol, opts))
        return {
          ok: true,
          value: {
            symbol,
            cgSymbol: snap.cgSymbol,
            pair: snap.pair,
            orderCount: snap.orderCount,
            updatedAt: snap.updatedAt ?? Date.now(),
            ...(snap.stale ? { stale: true } : {}),
            ...(snap.failedSources ? { failedSources: snap.failedSources } : {}),
            walls: snap.walls.map(w => ({
              id: w.id,
              exchange: w.exchange,
              ...(w.market !== undefined ? { market: w.market } : {}),
              side: w.side,
              price: w.price,
              currentUsd: w.currentUsd,
              startUsd: w.startUsd,
              startTime: w.startTime,
              currentTime: w.currentTime,
              state: w.state,
            })),
            ...(snap.trades ? { trades: snap.trades } : {}),
          },
        }
      }
      return {
        ok: true,
        value: await serveMarketEndpoint(withWatchlistBridge(marketData), endpoint, payload, next => {
          view = next
          viewAt = Date.now()
        }),
      }
    } catch (error) {
      return {
        ok: false,
        error: { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} },
      }
    }
  }

  ctx.inject(['systemPrompt'], scoped => {
    scoped.effect(() => scoped.systemPrompt.context({
      name: 'dsh-trading:chart-panel',
      order: 50,
      text: (context?: unknown) => chartPanelContextText(context, liveView()),
    }))
  })

  ctx.inject(['tools'], scoped => {
    scoped.effect(() => scoped.tools.register(defineTool({
      name: 'get_chart_view',
      description:
        "Read what the user's chart panel is currently displaying: symbol, timeframe, "
        + 'bar count, visible time span, last price, and whether it is refreshing live. '
        + 'Read-only. Use this instead of asking the user to describe or screenshot their chart.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            open: { type: 'boolean', required: true },
            symbol: { type: 'string' },
            timeframe: { type: 'string' },
            bars: { type: 'number' },
            from: { type: 'string' },
            to: { type: 'string' },
            close: { type: 'number' },
            live: { type: 'boolean' },
            origin: { type: 'string' },
            marks: { type: 'number' },
            marksDropped: { type: 'number' },
            marksTimeframe: { type: 'string' },
          },
        },
        render: (_args, value) => [{
          type: 'text',
          text: value.open
            ? `${value.symbol} @ ${value.timeframe} — ${value.bars} bars`
              + `${value.from !== undefined ? `, ${value.from} to ${value.to}` : ''}`
              + `${value.close !== undefined ? `, last ${value.close}` : ''}`
              + `, ${value.live === true ? 'live' : 'paused'} (${value.origin})`
              + `${value.marks !== undefined && value.marks > 0
                ? ` — your ${value.marks} marks from the ${value.marksTimeframe ?? ''} analysis are drawn`
                  + `${value.marksDropped !== undefined && value.marksDropped > 0 ? `, ${value.marksDropped} off-window` : ''}`
                : ''}`
            : 'The chart panel is empty — the user has not opened a chart.',
        }],
      },
      isConcurrencySafe: () => true,
      async execute() {
        const current = liveView()
        if (current === undefined) return { open: false }
        return {
          open: true,
          symbol: current.symbol,
          timeframe: current.timeframe,
          bars: current.bars,
          live: current.live,
          origin: current.origin,
          ...current.from !== undefined ? { from: current.from } : {},
          ...current.to !== undefined ? { to: current.to } : {},
          ...current.close !== undefined ? { close: current.close } : {},
          ...current.marks !== undefined ? { marks: current.marks } : {},
          ...current.marksDropped !== undefined ? { marksDropped: current.marksDropped } : {},
          ...current.marksTimeframe !== undefined ? { marksTimeframe: current.marksTimeframe } : {},
        }
      },
      presentCall: args => ({ card: 'generic', title: 'Read chart panel', kind: 'read', rawInput: args }),
    })))
  })

  ctx.inject(['connection', 'marketData', 'webServer'], scoped => {
    const connection = scoped.get('connection') as HostConnectionHandle & {
      register?: (owner: Context, channel: string, handler: ConnectionRpcHandler) => () => unknown
    }
    const marketData = scoped.get('marketData') as MarketDataLike

    scoped.effect(() => {
      const coinglass = typeof scoped.get === 'function'
        ? scoped.get('coinglass') as CoinglassService | undefined
        : undefined
      const handler = makeHandler(marketData, coinglass)
      const dispose = typeof connection.register === 'function'
        ? connection.register(scoped, MARKET_CHANNEL, handler)
        : connection.rpc.handle(MARKET_CHANNEL, handler)
      return () => {
        void dispose()
      }
    }, 'dsh-trading: market data channel')
  })
}
