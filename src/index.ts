/**
 * `dsh-trading`: Unified trading research & technical analysis plugin for DeepSeek Harness.
 *
 * Host composition (single plugin entrypoint, NO default export so Cordis Loader
 * preserves `inject` and `Config`):
 *  - `ctx.marketData` hub + CSV / CN (Eastmoney/Sina/Tencent) / Binance+OKX / optional Futu providers
 *  - `ctx.coinglass` large-order wall service
 *  - Model-facing analysis & evaluation tools (`market_snapshot`, `get_ohlcv`, `walkthrough`,
 *    `annotate_chart`, `find_swing_points`, `find_supply_demand_zones`, `large_orders`,
 *    `screen_market`, `run_backtest`, `run_custom_indicator`, `render_chart`,
 *    `resolve_symbol`, `list_symbols`, `audit_backtest`, `lint_strategy_code`,
 *    `get_holdings`/`stage_trade`/`commit_trade`/`discard_trade`/`list_trades`,
 *    `get_watchlist`/`add_to_watchlist`/`remove_from_watchlist`,
 *    `record_thesis`/`query_theses`/`update_thesis_status`,
 *    `check_trade_authority`, `list/create/remove/run/logs_scheduled_task*`, `get_chart_view`)
 *  - `risk-guard` pre-execute safety gate (refuses execution/fund-movement tools)
 *  - Web loopback RPC channel (`/dsh-trading-market`) + per-turn chart context prompt injection
 *    when `connection` and `webServer` exist (skipped silently in headless profiles).
 */

import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

import { MarketData, formatPctCn, formatUsdtCn } from './market-data/index.js'
import { apply as applyCsv, parseCsv } from './providers/csv.js'
import { CnMarketProvider, apply as applyCn, cnTimeToIso, finiteBars, formatRmbAmount, isCnSymbol, parseCnSymbol, parseSinaMoneyFlow, parseTencentQuote, toBarOpen } from './providers/cn.js'
import {
  BINANCE_TIMEFRAMES,
  BinanceProvider,
  GATE_TIMEFRAMES,
  OKX_TIMEFRAMES,
  OkxMarketProvider,
  apply as applyBinance,
  basisPct,
  closestSymbol,
  crowdVsWhaleOf,
  cvdFromTakerRows,
  cvdNoteOf,
  fundingAnnualizedPct,
  fundingLabelOf,
  isBinanceSymbol,
  normalizeSymbol,
  okxDerivatives,
  okxLiquidations1h,
  pctChange,
  positionReadings,
  postureOf,
  quadrantNote,
  quadrantOf,
  sampleAtOrBefore,
  takerDeltaOf,
} from './providers/binance.js'
import {
  CoinglassCapi,
  CoinglassService,
  DEFAULT_BASE_URL as COINGLASS_DEFAULT_BASE_URL,
  apply as applyCoinglass,
  decryptCapiBody,
  deriveKey0,
  flattenTrades,
  flattenWalls,
  formatAge,
  formatUsdCn,
  formatWallLine,
  isRateLimitError,
  normalizePair,
  renderLargeOrders,
  toCgSymbol,
} from './providers/coinglass/index.js'
import {
  SUPPORTED_TIMEFRAMES as FUTU_SUPPORTED_TIMEFRAMES,
  apply as applyFutu,
  describeVersionSkew,
  parseSdkVersion,
  probe as probeFutu,
  resolveSymbol as resolveFutuSymbol,
  resolveTimeframe as resolveFutuTimeframe,
  toCandle,
  toCandles,
  unreachableMessage as futuUnreachableMessage,
  wallClockToEpochMs,
} from './providers/futu/index.js'
import {
  CN_DEFAULT_FEE_RATES,
  DEFAULT_DENY_PATTERNS,
  apply as applyRiskGuard,
  calculateCnCost,
  calculatePriceLimits,
  compilePolicy,
  detectBoard,
  getPriceLimitRatio,
  validateLotSize,
  validatePriceLimit,
  validateTPlusOne,
} from './risk-guard/index.js'
import { apply as applyMarketTools } from './tools/index.js'
import { apply as applyVerdict } from './verdict/index.js'
import { HoldingsStore, apply as applyHoldings } from './holdings/index.js'
import type { Currency } from './holdings/types.js'
import { WatchlistStore, apply as applyWatchlist } from './watchlist/index.js'
import { KnowledgeStore, apply as applyKnowledge } from './knowledge/index.js'
import { AuthorityEngine, AuthorityService, apply as applyAuthority, canonicalizePayload, signGrant, verifyGrantSignature } from './authority/index.js'
import { TaskScheduler, apply as applyTasks } from './tasks-schedule/index.js'
import { applyChartHost } from './chart-view.js'

export {
  MarketData,
  formatUsdtCn,
  formatPctCn,
  parseCsv,
  CnMarketProvider,
  cnTimeToIso,
  finiteBars,
  formatRmbAmount,
  isCnSymbol,
  parseCnSymbol,
  parseSinaMoneyFlow,
  parseTencentQuote,
  toBarOpen,
  BINANCE_TIMEFRAMES,
  BinanceProvider,
  GATE_TIMEFRAMES,
  OKX_TIMEFRAMES,
  OkxMarketProvider,
  basisPct,
  closestSymbol,
  crowdVsWhaleOf,
  cvdFromTakerRows,
  cvdNoteOf,
  fundingAnnualizedPct,
  fundingLabelOf,
  isBinanceSymbol,
  normalizeSymbol,
  okxDerivatives,
  okxLiquidations1h,
  pctChange,
  positionReadings,
  postureOf,
  quadrantNote,
  quadrantOf,
  sampleAtOrBefore,
  takerDeltaOf,
  CoinglassCapi,
  CoinglassService,
  COINGLASS_DEFAULT_BASE_URL,
  decryptCapiBody,
  deriveKey0,
  flattenTrades,
  flattenWalls,
  formatAge,
  formatUsdCn,
  formatWallLine,
  isRateLimitError,
  normalizePair,
  renderLargeOrders,
  toCgSymbol,
  FUTU_SUPPORTED_TIMEFRAMES,
  describeVersionSkew,
  parseSdkVersion,
  probeFutu,
  resolveFutuSymbol,
  resolveFutuTimeframe,
  toCandle,
  toCandles,
  futuUnreachableMessage,
  wallClockToEpochMs,
  CN_DEFAULT_FEE_RATES,
  DEFAULT_DENY_PATTERNS,
  calculateCnCost,
  calculatePriceLimits,
  compilePolicy,
  detectBoard,
  getPriceLimitRatio,
  validateLotSize,
  validatePriceLimit,
  validateTPlusOne,
  HoldingsStore,
  WatchlistStore,
  KnowledgeStore,
  AuthorityEngine,
  AuthorityService,
  canonicalizePayload,
  signGrant,
  verifyGrantSignature,
  TaskScheduler,
}

export * from './tools/index.js'
export * from './verdict/index.js'
export * from './chart-view.js'
export type * from './market-data/types.js'
export type * from './providers/coinglass/types.js'
export type * from './holdings/types.js'
export type * from './watchlist/types.js'
export type * from './knowledge/types.js'
export type * from './authority/types.js'
export type * from './tasks-schedule/types.js'

export const name = 'dsh-trading'
// Empty top-level inject so headless profiles never stall on web-only services
// (`connection`, `webServer`), while optional host capabilities bind via `ctx.inject`.
export const inject = [] as const

const DEFAULT_BINANCE_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT']

export interface Config {
  /** Replace stock ui-layout with the chart-first workbench frame in browser. */
  tradingFrame?: boolean | undefined
  /** Default market-data provider id when symbol matching is ambiguous. */
  defaultProvider?: string | undefined
  /** Base directory for local CSV candles and JSON/ledger stores. */
  dataDir?: string | undefined
  /** Directory where render_chart writes standalone HTML charts. */
  chartDir?: string | undefined
  providers?: {
    csv?: {
      enabled?: boolean | undefined
      id?: string | undefined
      root?: string | undefined
    } | undefined
    cn?: {
      enabled?: boolean | undefined
      id?: string | undefined
      eastmoneyBaseURL?: string | undefined
      sinaBaseURL?: string | undefined
      tencentBaseURL?: string | undefined
      sinaMoneyFlowBaseURL?: string | undefined
      timeoutMs?: number | undefined
    } | undefined
    binance?: {
      enabled?: boolean | undefined
      id?: string | undefined
      symbols?: string[] | undefined
      baseURL?: string | undefined
      futuresURL?: string | undefined
      registerOkx?: boolean | undefined
      okxSymbols?: string[] | undefined
      allowUnofficialMirrors?: boolean | undefined
    } | undefined
    coinglass?: {
      enabled?: boolean | undefined
      baseURL?: string | undefined
      defaultExchange?: string | undefined
      defaultMarket?: 'perp' | 'spot' | undefined
      timeoutMs?: number | undefined
    } | undefined
    futu?: {
      enabled?: boolean | undefined
      id?: string | undefined
      symbols?: string[] | undefined
      host?: string | undefined
      port?: number | undefined
      ssl?: boolean | undefined
      key?: string | undefined
      bars?: number | undefined
    } | undefined
  } | undefined
  verdict?: {
    enabled?: boolean | undefined
    simulations?: number | undefined
    seed?: number | undefined
  } | undefined
  riskGuard?: {
    enabled?: boolean | undefined
    mode?: 'denylist' | 'allowlist' | undefined
    deny?: string[] | undefined
    allow?: string[] | undefined
  } | undefined
  holdings?: {
    enabled?: boolean | undefined
    storeDir?: string | undefined
    baseCurrency?: string | undefined
  } | undefined
  watchlist?: {
    enabled?: boolean | undefined
    storePath?: string | undefined
  } | undefined
  knowledge?: {
    enabled?: boolean | undefined
    storePath?: string | undefined
  } | undefined
  authority?: {
    enabled?: boolean | undefined
    grantPath?: string | undefined
    publicKeyPem?: string | undefined
  } | undefined
  tasksSchedule?: {
    enabled?: boolean | undefined
    tasksFilePath?: string | undefined
    logsFilePath?: string | undefined
  } | undefined
  chartPanel?: {
    enabled?: boolean | undefined
  } | undefined
}

export const Config: z<Config> = z.object({
  tradingFrame: z.boolean().default(true).description('Use the chart-first workbench frame instead of the stock layout (restart plugin after toggling).'),
  defaultProvider: z.string().description('Default market-data provider id when no symbol matcher claims a symbol.'),
  dataDir: z.string().description('Base directory for local trading stores and CSV candles.'),
  chartDir: z.string().description('Directory where render_chart writes HTML files.'),
  providers: z.object({
    csv: z.object({
      enabled: z.boolean().default(true),
      id: z.string().default('csv'),
      root: z.string(),
    }).default({}),
    cn: z.object({
      enabled: z.boolean().default(true),
      id: z.string().default('cn'),
      eastmoneyBaseURL: z.string().default('https://push2his.eastmoney.com'),
      sinaBaseURL: z.string().default('https://quotes.sina.cn'),
      tencentBaseURL: z.string().default('https://qt.gtimg.cn'),
      sinaMoneyFlowBaseURL: z.string().default('https://vip.stock.finance.sina.com.cn'),
      timeoutMs: z.number().min(1).default(8000),
    }).default({}),
    binance: z.object({
      enabled: z.boolean().default(true),
      id: z.string().default('binance'),
      symbols: z.array(z.string()).default([...DEFAULT_BINANCE_SYMBOLS]),
      baseURL: z.string().default('https://data-api.binance.vision'),
      futuresURL: z.string().default('https://fapi.binance.com'),
      registerOkx: z.boolean().default(true),
      okxSymbols: z.array(z.string()).default([...DEFAULT_BINANCE_SYMBOLS]),
      allowUnofficialMirrors: z.boolean().default(true).description('Fall back to third-party mirror domains (usnbweb.red, btmrvkxwhpn.com, ouyi.fit) if official Binance/OKX APIs fail.'),
    }).default({}),
    coinglass: z.object({
      enabled: z.boolean().default(true),
      baseURL: z.string().default('https://capi.coinglass.com'),
      defaultExchange: z.string().default('Binance'),
      defaultMarket: z.union(['perp', 'spot'] as const).default('perp'),
      timeoutMs: z.number().default(30_000),
    }).default({}),
    futu: z.object({
      enabled: z.boolean().default(false),
      id: z.string().default('futu'),
      symbols: z.array(z.string()).default([]),
      host: z.string().default('127.0.0.1'),
      port: z.number().default(33333),
      ssl: z.boolean().default(false),
      key: z.string(),
      bars: z.number().default(1000),
    }).default({}),
  }).default({}),
  verdict: z.object({
    enabled: z.boolean().default(true),
    simulations: z.number().default(1000),
    seed: z.number().default(42),
  }).default({}),
  riskGuard: z.object({
    enabled: z.boolean().default(true),
    mode: z.union(['denylist', 'allowlist'] as const).default('denylist'),
    deny: z.array(z.string()).default([...DEFAULT_DENY_PATTERNS]),
    allow: z.array(z.string()).default([]),
  }).default({}),
  holdings: z.object({
    enabled: z.boolean().default(true),
    storeDir: z.string(),
    baseCurrency: z.string().default('USDT'),
  }).default({}),
  watchlist: z.object({
    enabled: z.boolean().default(true),
    storePath: z.string(),
  }).default({}),
  knowledge: z.object({
    enabled: z.boolean().default(true),
    storePath: z.string(),
  }).default({}),
  authority: z.object({
    enabled: z.boolean().default(true),
    grantPath: z.string(),
    publicKeyPem: z.string(),
  }).default({}),
  tasksSchedule: z.object({
    enabled: z.boolean().default(true),
    tasksFilePath: z.string(),
    logsFilePath: z.string(),
  }).default({}),
  chartPanel: z.object({
    enabled: z.boolean().default(true),
  }).default({}),
}) as unknown as z<Config>

function expandHome(raw: string): string {
  if (raw === '~') return homedir()
  if (raw.startsWith('~/') || raw.startsWith('~\\')) return join(homedir(), raw.slice(2))
  return raw
}

function resolveUserPath(raw: string): string {
  const expanded = expandHome(raw)
  return isAbsolute(expanded) ? expanded : resolve(process.cwd(), expanded)
}

function defaultStorageBase(ctx: Context): string {
  const dshHome = process.env['DSH_HOME']?.trim()
  if (dshHome) return join(resolve(expandHome(dshHome)), 'dsh-trading')
  try {
    if (ctx.get('loader') !== undefined || ctx.get('profileContext') !== undefined) {
      return join(homedir(), '.dsh', 'dsh-trading')
    }
  } catch {
    // Minimal mock context in unit tests
  }
  return process.cwd()
}

export function apply(ctx: Context, config: Config = {}): void {
  const storageBase = defaultStorageBase(ctx)
  const dataDir = config.dataDir ? resolveUserPath(config.dataDir) : join(storageBase, 'data')
  const chartDir = config.chartDir ? resolveUserPath(config.chartDir) : join(storageBase, 'charts')

  const p = config.providers ?? {}
  const csvEnabled = p.csv?.enabled !== false
  const cnEnabled = p.cn?.enabled !== false
  const binanceEnabled = p.binance?.enabled !== false
  const coinglassEnabled = p.coinglass?.enabled !== false
  const futuEnabled = p.futu?.enabled === true

  const defaultProvider =
    config.defaultProvider
    ?? (csvEnabled ? (p.csv?.id ?? 'csv')
      : binanceEnabled ? (p.binance?.id ?? 'binance')
        : cnEnabled ? (p.cn?.id ?? 'cn')
          : futuEnabled ? (p.futu?.id ?? 'futu') : undefined)

  // 1. Core services (`ctx.marketData`, `ctx.coinglass`) registered directly on `ctx`
  new MarketData(ctx, defaultProvider !== undefined ? { defaultProvider } : {})

  // Always register `ctx.coinglass` so `enabled: false` refuses requests instead
  // of falling back to ad-hoc CoinglassCapi clients in tools or RPC.
  applyCoinglass(ctx, {
    enabled: coinglassEnabled,
    baseURL: p.coinglass?.baseURL ?? 'https://capi.coinglass.com',
    defaultExchange: p.coinglass?.defaultExchange ?? 'Binance',
    defaultMarket: p.coinglass?.defaultMarket ?? 'perp',
    timeoutMs: p.coinglass?.timeoutMs ?? 30_000,
  })

  // 2. Market data providers
  if (csvEnabled) {
    applyCsv(ctx, {
      id: p.csv?.id ?? 'csv',
      root: p.csv?.root ? resolveUserPath(p.csv.root) : dataDir,
    })
  }
  if (cnEnabled) {
    applyCn(ctx, {
      id: p.cn?.id ?? 'cn',
      eastmoneyBaseURL: p.cn?.eastmoneyBaseURL ?? 'https://push2his.eastmoney.com',
      sinaBaseURL: p.cn?.sinaBaseURL ?? 'https://quotes.sina.cn',
      tencentBaseURL: p.cn?.tencentBaseURL ?? 'https://qt.gtimg.cn',
      sinaMoneyFlowBaseURL: p.cn?.sinaMoneyFlowBaseURL ?? 'https://vip.stock.finance.sina.com.cn',
      timeoutMs: p.cn?.timeoutMs ?? 8000,
    })
  }
  if (binanceEnabled) {
    applyBinance(ctx, {
      id: p.binance?.id ?? 'binance',
      symbols: p.binance?.symbols ?? [...DEFAULT_BINANCE_SYMBOLS],
      baseURL: p.binance?.baseURL ?? 'https://data-api.binance.vision',
      futuresURL: p.binance?.futuresURL ?? 'https://fapi.binance.com',
      registerOkx: p.binance?.registerOkx ?? true,
      okxSymbols: p.binance?.okxSymbols ?? [...DEFAULT_BINANCE_SYMBOLS],
      allowUnofficialMirrors: p.binance?.allowUnofficialMirrors ?? true,
    })
  }
  if (futuEnabled) {
    applyFutu(ctx, {
      id: p.futu?.id ?? 'futu',
      symbols: p.futu?.symbols ?? [],
      host: p.futu?.host ?? '127.0.0.1',
      port: p.futu?.port ?? 33333,
      ssl: p.futu?.ssl ?? false,
      bars: p.futu?.bars ?? 1000,
      ...(p.futu?.key !== undefined ? { key: p.futu.key } : {}),
    })
  }

  // 3. Shared watchlist store (bridges model tools + browser chart panel RPC)
  const watchlistCfg = config.watchlist ?? {}
  const watchlistStore = watchlistCfg.enabled !== false
    ? new WatchlistStore({
        filePath: watchlistCfg.storePath ? resolveUserPath(watchlistCfg.storePath) : join(dataDir, 'watchlist.json'),
      })
    : undefined

  // 4. Risk guard pre-execute gate
  const rg = config.riskGuard ?? {}
  if (rg.enabled !== false) {
    applyRiskGuard(ctx, {
      mode: rg.mode ?? 'denylist',
      deny: rg.deny ?? [...DEFAULT_DENY_PATTERNS],
      allow: rg.allow ?? [],
    })
  }

  // 5. Model-facing tools (mounted once both `tools` and `marketData` exist)
  ctx.inject(['tools', 'marketData'], scoped => {
    applyMarketTools(scoped, { chartDir })

    const vd = config.verdict ?? {}
    if (vd.enabled !== false) {
      applyVerdict(scoped, {
        simulations: vd.simulations ?? 1000,
        seed: vd.seed ?? 42,
      })
    }

    const hd = config.holdings ?? {}
    if (hd.enabled !== false) {
      applyHoldings(scoped, {
        storeDir: hd.storeDir ? resolveUserPath(hd.storeDir) : join(dataDir, 'holdings'),
        baseCurrency: (hd.baseCurrency ?? 'USDT') as Currency,
      })
    }

    if (watchlistStore !== undefined) {
      applyWatchlist(scoped, { storePath: watchlistStore.filePath }, watchlistStore)
    }

    const kn = config.knowledge ?? {}
    if (kn.enabled !== false) {
      applyKnowledge(scoped, {
        storePath: kn.storePath ? resolveUserPath(kn.storePath) : join(dataDir, 'knowledge.json'),
      })
    }

    const au = config.authority ?? {}
    if (au.enabled !== false) {
      applyAuthority(scoped, {
        grantPath: au.grantPath ? resolveUserPath(au.grantPath) : join(dataDir, 'live-trading.grant.json'),
        ...(au.publicKeyPem !== undefined ? { publicKeyPem: au.publicKeyPem } : {}),
      })
    }

    const ts = config.tasksSchedule ?? {}
    if (ts.enabled !== false) {
      applyTasks(scoped, {
        tasksFilePath: ts.tasksFilePath ? resolveUserPath(ts.tasksFilePath) : join(dataDir, 'tasks.json'),
        logsFilePath: ts.logsFilePath ? resolveUserPath(ts.logsFilePath) : join(dataDir, 'task-logs.json'),
      })
    }
  })

  // 6. Browser RPC + chart context + `get_chart_view`
  if (config.chartPanel?.enabled !== false) {
    applyChartHost(ctx, {
      watchlistStore,
      watchlistEnabled: watchlistCfg.enabled !== false,
    })
  }
}
