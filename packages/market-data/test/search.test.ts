import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { MarketData } from '../src/index.js'
import type { Candle, InstrumentInfo, MarketDataProvider, OhlcvQuery } from '../src/index.js'

function baseProvider(
  id: string,
  searchFn?: (query: string) => Promise<InstrumentInfo[]>,
): MarketDataProvider {
  return {
    id,
    description: `test ${id}`,
    async listSymbols(): Promise<InstrumentInfo[]> {
      return []
    },
    async getOhlcv(_query: OhlcvQuery): Promise<Candle[]> {
      return []
    },
    ...(searchFn !== undefined ? { search: searchFn } : {}),
  }
}

describe('MarketData search routing', () => {
  it('routes explicit providerId directly and returns empty when search is absent', async () => {
    const hub = new MarketData(new Context(), { defaultProvider: 'binance' })
    hub.register(baseProvider('binance', async q => [{ symbol: 'BTCUSDT', name: q, assetClass: 'crypto' }]))
    hub.register(baseProvider('csv'))

    expect(await hub.search('btc', 'binance')).toEqual([
      { symbol: 'BTCUSDT', name: 'btc', assetClass: 'crypto' },
    ])
    expect(await hub.search('btc', 'csv')).toEqual([])
    await expect(() => hub.search('btc', 'missing')).toThrowError(/unknown market-data provider 'missing'/)
  })

  it('queries mounted providers in deterministic priority order binance -> cn -> public -> others when providerId is omitted', async () => {
    const hub = new MarketData(new Context(), { defaultProvider: 'binance' })
    const order: string[] = []
    // Register in reverse order intentionally to prove priority sorting is deterministic
    hub.register(baseProvider('custom', async () => {
      order.push('custom')
      return [{ symbol: 'CUST1', name: 'Custom', assetClass: 'other' }]
    }))
    hub.register(baseProvider('public', async () => {
      order.push('public')
      return [{ symbol: 'BTC-USD', name: 'Bitcoin', assetClass: 'crypto' }]
    }))
    hub.register(baseProvider('cn', async () => {
      order.push('cn')
      return [{ symbol: '600519', name: '贵州茅台', assetClass: 'equity' }]
    }))
    hub.register(baseProvider('binance', async () => {
      order.push('binance')
      return [{ symbol: 'BTCUSDT', name: '比特币', assetClass: 'crypto' }]
    }))

    const hits = await hub.searchWithProvider('test')
    expect(order).toEqual(['binance', 'cn', 'public', 'custom'])
    expect(hits).toEqual([
      { providerId: 'binance', item: { symbol: 'BTCUSDT', name: '比特币', assetClass: 'crypto' } },
      { providerId: 'cn', item: { symbol: '600519', name: '贵州茅台', assetClass: 'equity' } },
      { providerId: 'public', item: { symbol: 'BTC-USD', name: 'Bitcoin', assetClass: 'crypto' } },
      { providerId: 'custom', item: { symbol: 'CUST1', name: 'Custom', assetClass: 'other' } },
    ])
    expect((await hub.search('test')).map(i => i.symbol)).toEqual(['BTCUSDT', '600519', 'BTC-USD', 'CUST1'])
  })

  it('deduplicates identical providerId:symbol hits and isolates failing providers in multi-source search', async () => {
    const hub = new MarketData(new Context(), { defaultProvider: 'binance' })
    hub.register(baseProvider('binance', async () => {
      throw new Error('upstream timeout')
    }))
    hub.register(baseProvider('public', async () => [
      { symbol: 'AAPL', name: 'Apple', assetClass: 'equity' },
      { symbol: 'AAPL', name: 'Apple Inc.', assetClass: 'equity' },
    ]))

    const hits = await hub.searchWithProvider('apple')
    expect(hits).toEqual([
      { providerId: 'public', item: { symbol: 'AAPL', name: 'Apple', assetClass: 'equity' } },
    ])
  })

  it('propagates errors when an explicit providerId search fails', async () => {
    const hub = new MarketData(new Context())
    hub.register(baseProvider('public', async () => {
      throw new Error('yahoo down')
    }))

    await expect(hub.search('apple', 'public')).rejects.toThrowError('yahoo down')
  })
})
