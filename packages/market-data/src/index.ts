/**
 * `ctx.marketData`: the provider registry the rest of dsh-trading talks to.
 * The service owns no IO — providers own their media (files, databases,
 * exchange APIs); this hub only routes queries and scopes registrations to
 * the registering plugin's lifetime.
 * @module @dsh-trading/market-data
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type {
  Candle,
  Derivatives,
  FundamentalsPackage,
  InstrumentInfo,
  MarketDataProvider,
  MoneyFlow,
  OhlcvQuery,
  Orderbook,
} from './types.js'

export type * from './types.js'
export { formatUsdtCn, formatPctCn } from './format.js'

/** One instrument hit paired with the provider that owns it. */
export interface SearchHit {
  providerId: string
  item: InstrumentInfo
}

/** Deterministic search precedence across mounted feeds. */
const SEARCH_PRIORITY: readonly string[] = ['binance', 'cn', 'public']

declare module '@deepseek-ai/cordis' {
  interface Context {
    marketData: MarketData
  }
}

/**
 * The market-data hub. Providers register under their id and unregister via
 * the returned disposer; consumers resolve by id or take the default (the
 * sole provider, or the one named by `defaultProvider`).
 */
export class MarketData extends Service {
  private readonly providers = new Map<string, MarketDataProvider>()
  private defaultId: string | undefined

  constructor(ctx: Context, config: MarketData.Config = {}) {
    super(ctx, 'marketData')
    this.defaultId = config.defaultProvider
  }

  /**
   * Mount a provider. Duplicate ids fail loud — two silently-shadowing data
   * sources is exactly the ambiguity a research log must never contain.
   * @returns the disposer that unmounts the provider.
   */
  register(provider: MarketDataProvider): () => void {
    if (this.providers.has(provider.id)) {
      throw new Error(`market-data provider '${provider.id}' is already registered`)
    }
    this.providers.set(provider.id, provider)
    return () => {
      if (this.providers.get(provider.id) === provider) {
        this.providers.delete(provider.id)
      }
    }
  }

  /** Ids of all mounted providers, registration-ordered. */
  list(): string[] {
    return [...this.providers.keys()]
  }

  /**
   * Resolve a provider. With no id: the configured default when set, else
   * the sole mounted provider; ambiguity (zero or several, none default)
   * throws rather than guessing where data comes from.
   */
  provider(id?: string): MarketDataProvider {
    if (id !== undefined) {
      const found = this.providers.get(id)
      if (!found) {
        throw new Error(`unknown market-data provider '${id}' (mounted: ${this.list().join(', ') || 'none'})`)
      }
      return found
    }
    if (this.defaultId !== undefined) return this.provider(this.defaultId)
    if (this.providers.size === 1) return [...this.providers.values()][0]!
    throw new Error(
      this.providers.size === 0
        ? 'no market-data provider is mounted'
        : `several providers are mounted (${this.list().join(', ')}); pass an id or configure defaultProvider`,
    )
  }

  /**
   * Resolve a provider by explicit id first, then by matching the requested symbol
   * against mounted providers' matchesSymbol(), and lastly falling back to the default provider.
   */
  resolveProvider(symbol?: string, explicitId?: string): MarketDataProvider {
    if (explicitId !== undefined) return this.provider(explicitId)
    if (symbol) {
      for (const p of this.providers.values()) {
        try {
          if (p.matchesSymbol?.(symbol)) return p
        } catch {
          // ignore error in matcher
        }
      }
    }
    return this.provider()
  }

  /** Convenience: route one candle query through the resolved provider. */
  getOhlcv(query: OhlcvQuery, providerId?: string): Promise<Candle[]> {
    return this.resolveProvider(query.symbol, providerId).getOhlcv(query)
  }

  /** Convenience: route positioning snapshot through the resolved provider. */
  async getDerivatives(symbol: string, providerId?: string): Promise<Derivatives | null> {
    const p = this.resolveProvider(symbol, providerId)
    if (typeof p.getDerivatives === 'function') {
      return p.getDerivatives(symbol)
    }
    return null
  }

  /** Convenience: route money flow query through the resolved provider. */
  async getMoneyFlow(symbol: string, providerId?: string): Promise<MoneyFlow | null> {
    const p = this.resolveProvider(symbol, providerId)
    if (typeof p.getMoneyFlow === 'function') {
      return p.getMoneyFlow(symbol)
    }
    return null
  }

  /** Convenience: route L2 orderbook query through the resolved provider. */
  async getOrderbook(symbol: string, providerId?: string): Promise<Orderbook | null> {
    const p = this.resolveProvider(symbol, providerId)
    if (typeof p.getOrderbook === 'function') {
      return p.getOrderbook(symbol)
    }
    return null
  }

  /** Convenience: route stock fundamentals query through the resolved provider. */
  async getFundamentals(symbol: string, providerId?: string): Promise<FundamentalsPackage | null> {
    const p = this.resolveProvider(symbol, providerId)
    if (typeof p.getFundamentals === 'function') {
      return p.getFundamentals(symbol)
    }
    return null
  }

  /** Convenience: enumerate instruments of the resolved provider. */
  listSymbols(providerId?: string): Promise<InstrumentInfo[]> {
    return this.provider(providerId).listSymbols()
  }

  private orderedSearchProviders(): MarketDataProvider[] {
    const out: MarketDataProvider[] = []
    const seen = new Set<string>()
    for (const id of SEARCH_PRIORITY) {
      const p = this.providers.get(id)
      if (p !== undefined) {
        out.push(p)
        seen.add(id)
      }
    }
    for (const [id, p] of this.providers) {
      if (!seen.has(id)) out.push(p)
    }
    return out
  }

  /**
   * Search instruments and keep each hit's owning providerId.
   * When providerId is named, query that provider strictly; otherwise query all
   * mounted searchable providers in deterministic order (binance -> cn -> public -> others),
   * isolating single-provider failures.
   */
  searchWithProvider(query: string, providerId?: string): Promise<SearchHit[]> {
    if (providerId !== undefined) {
      const provider = this.provider(providerId)
      if (provider.search === undefined) return Promise.resolve([])
      return provider.search(query).then(items => deduplicateHits([{ providerId: provider.id, items }]))
    }
    const searchable = this.orderedSearchProviders().filter(p => typeof p.search === 'function')
    if (searchable.length === 0) return Promise.resolve([])
    return Promise.allSettled(searchable.map(p => p.search!(query))).then(results => {
      const groups: Array<{ providerId: string; items: InstrumentInfo[] }> = []
      for (let i = 0; i < searchable.length; i += 1) {
        const res = results[i]!
        if (res.status === 'fulfilled') groups.push({ providerId: searchable[i]!.id, items: res.value })
      }
      return deduplicateHits(groups)
    })
  }

  /**
   * Convenience: resolve free text to instruments through one explicit provider
   * or across mounted providers in priority order.
   */
  search(query: string, providerId?: string): Promise<InstrumentInfo[]> {
    return this.searchWithProvider(query, providerId).then(hits => hits.map(h => h.item))
  }
}

function deduplicateHits(groups: readonly { providerId: string; items: readonly InstrumentInfo[] }[]): SearchHit[] {
  const out: SearchHit[] = []
  const seen = new Set<string>()
  for (const { providerId, items } of groups) {
    for (const item of items) {
      const key = `${providerId}\0${item.symbol.trim().toUpperCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ providerId, item })
    }
  }
  return out
}

export namespace MarketData {
  export interface Config {
    /** Provider id consumers get when they don't name one. */
    defaultProvider?: string
  }
}

export default MarketData
