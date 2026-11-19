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

  it('prefers equity/exact matches over non-exact cn index hits like 腾讯 -> 腾讯济安, while preserving cn priority for indices/A-shares', async () => {
    const hub = new MarketData(new Context(), { defaultProvider: 'binance' })
    hub.register(baseProvider('binance', async () => []))
    hub.register(baseProvider('cn', async (q) => {
      if (q === '腾讯' || q === '腾讯济安') return [{ symbol: 'sh000847', name: '腾讯济安', assetClass: 'index' }]
      if (q === '上证') return [{ symbol: 'sh000001', name: '上证指数', assetClass: 'index' }]
      if (q === '茅台') return [{ symbol: '600519', name: '贵州茅台', assetClass: 'equity' }]
      if (q === '京东') return [{ symbol: '000725', name: '京东方A', assetClass: 'equity' }]
      return []
    }))
    hub.register(baseProvider('public', async (q) => {
      if (q === '腾讯' || q === '腾讯济安') return [{ symbol: '0700.HK', name: '腾讯控股', assetClass: 'equity' }]
      if (q === '上证') return [{ symbol: '000001.SS', name: '上证指数', assetClass: 'index' }]
      if (q === '茅台') return [{ symbol: '600519.SS', name: '贵州茅台', assetClass: 'equity' }]
      if (q === '京东') return [{ symbol: 'JD', name: '京东', assetClass: 'equity' }]
      return []
    }))

    const tencentHits = await hub.searchWithProvider('腾讯')
    expect(tencentHits.map(h => `${h.providerId}:${h.item.symbol}`)).toEqual(['public:0700.HK', 'cn:sh000847'])

    const tencentIndexHits = await hub.searchWithProvider('腾讯济安')
    expect(tencentIndexHits[0]?.providerId).toBe('cn')
    expect(tencentIndexHits[0]?.item.symbol).toBe('sh000847')

    const sseHits = await hub.searchWithProvider('上证')
    expect(sseHits[0]?.providerId).toBe('cn')
    expect(sseHits[0]?.item.symbol).toBe('sh000001')

    const maotaiHits = await hub.searchWithProvider('茅台')
    expect(maotaiHits[0]?.providerId).toBe('cn')
    expect(maotaiHits[0]?.item.symbol).toBe('600519')

    const jdHits = await hub.searchWithProvider('京东')
    expect(jdHits[0]?.providerId).toBe('public')
    expect(jdHits[0]?.item.symbol).toBe('JD')
  })

  it('propagates errors when an explicit providerId search fails', async () => {
    const hub = new MarketData(new Context())
    hub.register(baseProvider('public', async () => {
      throw new Error('yahoo down')
    }))

    await expect(hub.search('apple', 'public')).rejects.toThrowError('yahoo down')
  })
})
