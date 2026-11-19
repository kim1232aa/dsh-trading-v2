import { afterEach, describe, expect, it, vi } from 'vitest'
import { CnMarketProvider } from '../src/index.js'

describe('CnMarketProvider search', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves A-share codes, .SS/.SZ suffixes, and built-in CN stock/index aliases without network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const provider = new CnMarketProvider('cn', 'https://em.test', 'https://sina.test', 'https://qt.test', 2000, 'https://sinamf.test')

    expect((await provider.search('贵州茅台'))[0]).toMatchObject({ symbol: '600519', name: '贵州茅台', assetClass: 'equity' })
    expect((await provider.search('茅台'))[0]?.symbol).toBe('600519')
    expect((await provider.search('上证指数'))[0]).toMatchObject({ symbol: 'sh000001', assetClass: 'index' })
    expect((await provider.search('科创50'))[0]).toMatchObject({ symbol: 'sh000688', assetClass: 'index' })
    expect((await provider.search('600519.SS'))[0]?.symbol).toBe('600519')
    expect((await provider.search('SH.600519'))[0]?.symbol).toBe('600519')
    expect((await provider.search('sz300750'))[0]?.symbol).toBe('300750')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('queries EastMoney suggest for unknown Chinese A-share names and keeps only A-share/CN-index hits', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({
        QuotationCodeTable: {
          Data: [
            { Code: '688256', Name: '寒武纪', MktNum: '1', SecurityTypeName: '科创板' },
            { Code: '02899', Name: '寒武纪-H(测试)', MktNum: '116', SecurityTypeName: '港股' },
          ],
        },
      }), { status: 200 }),
    )
    const provider = new CnMarketProvider('cn', 'https://em.test', 'https://sina.test', 'https://qt.test', 2000, 'https://sinamf.test')
    const hits = await provider.search('寒武纪')
    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(hits.map(h => h.symbol)).toEqual(['688256'])
    expect(hits[0]?.name).toBe('寒武纪')
  })

  it('does not claim crypto or foreign equities and fails gracefully when suggest errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    const provider = new CnMarketProvider('cn', 'https://em.test', 'https://sina.test', 'https://qt.test', 2000, 'https://sinamf.test')

    expect(await provider.search('BTC')).toEqual([])
    expect(await provider.search('AAPL')).toEqual([])
    expect(await provider.search('未知中文股')).toEqual([])
  })
})
