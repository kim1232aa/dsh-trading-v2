import { describe, expect, it } from 'vitest'
import { BinanceProvider, OkxMarketProvider } from '../src/index.js'

describe('BinanceProvider & OkxMarketProvider search', () => {
  it('resolves Chinese, English, and ticker aliases inside its symbol catalogue', async () => {
    const provider = new BinanceProvider(
      'binance',
      ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'],
      'https://data-api.binance.vision',
      'https://fapi.binance.com',
    )

    const btcCn = await provider.search('比特币')
    expect(btcCn[0]?.symbol).toBe('BTCUSDT')
    expect(btcCn[0]?.assetClass).toBe('crypto')

    const ethEn = await provider.search('ethereum')
    expect(ethEn[0]?.symbol).toBe('ETHUSDT')
    expect(ethEn[0]?.name?.toLowerCase()).toBe('ethereum')

    const pair = await provider.search('ETH/USDT')
    expect(pair[0]?.symbol).toBe('ETHUSDT')

    const okx = new OkxMarketProvider('okx', ['BTCUSDT', 'SOLUSDT'])
    expect((await okx.search('索拉纳'))[0]?.symbol).toBe('SOLUSDT')
  })

  it('rejects equities, A-shares, Yahoo dash tickers, and uncatalogued symbols', async () => {
    const provider = new BinanceProvider(
      'binance',
      ['BTCUSDT', 'ETHUSDT'],
      'https://data-api.binance.vision',
      'https://fapi.binance.com',
    )

    expect(await provider.search('600519')).toEqual([])
    expect(await provider.search('腾讯')).toEqual([])
    expect(await provider.search('AAPL')).toEqual([])
    expect(await provider.search('US.MU')).toEqual([])
    expect(await provider.search('BTC-USD')).toEqual([])
    expect(await provider.search('DOGE')).toEqual([])
  })
})
