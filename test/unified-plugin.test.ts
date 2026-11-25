import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { apply, Config, ENDPOINTS, MARKET_CHANNEL, name } from '../src/index.js'

const dirs: string[] = []
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})

describe('unified dsh-trading host plugin', () => {
  it('mounts marketData, coinglass, risk-guard, all 33 tools, and bridges watchlist RPC', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-trading-unified-'))
    dirs.push(dir)

    const ctx = new Context()
    const registeredTools = new Map<string, any>()
    let rpcHandler: ((endpoint: string, payload: unknown) => Promise<any>) | undefined

    ctx.reflect.provide('tools', {
      register(def: any) {
        registeredTools.set(def.name, def)
        return () => registeredTools.delete(def.name)
      },
    })
    ctx.reflect.provide('systemPrompt', {
      context() { return () => {} },
    })
    ctx.reflect.provide('webServer', {})
    ctx.reflect.provide('connection', {
      register(_owner: unknown, channel: string, handler: any) {
        if (channel === MARKET_CHANNEL) rpcHandler = handler
        return () => { rpcHandler = undefined }
      },
    })

    const fiber = ctx.plugin({ name, inject: [], Config, apply }, {
      dataDir: join(dir, 'data'),
      chartDir: join(dir, 'charts'),
    })

    await fiber.await()

    const marketData = ctx.get('marketData')
    expect(marketData).toBeDefined()
    expect(marketData.list()).toEqual(expect.arrayContaining(['csv', 'cn', 'binance', 'okx']))
    expect(ctx.get('coinglass')).toBeDefined()
    expect(registeredTools.size).toBe(33)
    expect(rpcHandler).toBeDefined()

    // Watchlist tool <-> RPC bridge uses the same WatchlistStore file
    const addRes = await rpcHandler!(ENDPOINTS.watchlistAdd, { symbol: 'NVDA', group: '美股', notes: 'AI' })
    expect(addRes).toEqual({ ok: true, value: { ok: true, symbol: 'NVDA' } })

    const getTool = registeredTools.get('get_watchlist')
    const toolOut = await getTool.execute({}, {})
    expect(toolOut.items.some((it: any) => it.symbol === 'NVDA' && it.group === '美股')).toBe(true)

    const rpcList = await rpcHandler!(ENDPOINTS.watchlist, {})
    expect(rpcList.ok).toBe(true)
    expect(rpcList.value.items.some((it: any) => it.symbol === 'NVDA')).toBe(true)

    // Risk guard blocks order placement
    const verdict = await ctx.waterfall('tools/pre-execute', { name: 'place_order', args: {} }, async () => ({ kind: 'allow' }))
    expect(verdict).toMatchObject({ kind: 'deny' })
  })
})
