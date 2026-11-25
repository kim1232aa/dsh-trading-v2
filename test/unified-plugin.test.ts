import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { apply, Config, ENDPOINTS, MARKET_CHANNEL, name } from '../src/index.js'

const dirs: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
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
      rpc: {
        handle(channel: string, handler: any) {
          if (channel === MARKET_CHANNEL) rpcHandler = handler
          return () => { rpcHandler = undefined }
        },
      },
    })

    const fiber = ctx.plugin({ name, inject: [], Config, apply }, {
      dataDir: join(dir, 'data'),
      chartDir: join(dir, 'charts'),
    })

    await fiber.await()

    const marketData = ctx.get('marketData')
    expect(marketData).toBeDefined()
    expect(marketData!.list()).toEqual(expect.arrayContaining(['csv', 'cn', 'binance', 'okx']))
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
    const exec = {
      callId: 'call-1',
      rootCallId: 'call-1',
      name: 'place_order',
      arguments: {},
      signal: new AbortController().signal,
      token: Symbol('token'),
    } as unknown as ToolExecution
    const verdict = await ctx.waterfall('tools/pre-execute', exec, async () => ({ kind: 'allow' }))
    expect(verdict).toMatchObject({ kind: 'deny' })
  })

  it('honours providers.coinglass.enabled=false and watchlist.enabled=false without falling back to network or fake presets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-trading-disabled-'))
    dirs.push(dir)

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network must not be called'))

    const ctx = new Context()
    const registeredTools = new Map<string, any>()
    let rpcHandler: ((endpoint: string, payload: unknown) => Promise<any>) | undefined

    ctx.reflect.provide('tools', {
      register(def: any) {
        registeredTools.set(def.name, def)
        return () => registeredTools.delete(def.name)
      },
    })
    ctx.reflect.provide('systemPrompt', { context() { return () => {} } })
    ctx.reflect.provide('webServer', {})
    ctx.reflect.provide('connection', {
      rpc: {
        handle(channel: string, handler: any) {
          if (channel === MARKET_CHANNEL) rpcHandler = handler
          return () => { rpcHandler = undefined }
        },
      },
    })

    const fiber = ctx.plugin({ name, inject: [], Config, apply }, {
      dataDir: join(dir, 'data'),
      chartDir: join(dir, 'charts'),
      providers: { coinglass: { enabled: false } },
      watchlist: { enabled: false },
    })
    await fiber.await()

    const largeOrdersTool = registeredTools.get('large_orders')
    await expect(largeOrdersTool.execute({ symbol: 'BTCUSDT' }, {})).rejects.toThrow(/disabled/i)
    const rpcWalls = await rpcHandler!(ENDPOINTS.largeOrders, { symbol: 'BTCUSDT' })
    expect(rpcWalls).toEqual({ ok: true, value: { symbol: 'BTCUSDT', cgSymbol: '', pair: '', orderCount: 0, walls: [] } })
    expect(fetchSpy).not.toHaveBeenCalled()

    const wl = await rpcHandler!(ENDPOINTS.watchlist, {})
    expect(wl).toEqual({ ok: true, value: { items: [], groups: [] } })
    const wlAdd = await rpcHandler!(ENDPOINTS.watchlistAdd, { symbol: 'NVDA' })
    expect(wlAdd).toMatchObject({ ok: true, value: { ok: false } })
    const wlRm = await rpcHandler!(ENDPOINTS.watchlistRemove, { symbol: 'NVDA' })
    expect(wlRm).toMatchObject({ ok: true, value: { ok: false } })
  })

  it('restricts Binance/OKX requests to official endpoints when allowUnofficialMirrors=false', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-trading-official-only-'))
    dirs.push(dir)

    const visited: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      visited.push(String(input))
      return new Response('down', { status: 503 })
    })

    const ctx = new Context()
    ctx.reflect.provide('tools', { register: () => () => {} })

    const fiber = ctx.plugin({ name, inject: [], Config, apply }, {
      dataDir: join(dir, 'data'),
      chartDir: join(dir, 'charts'),
      providers: {
        binance: { enabled: true, allowUnofficialMirrors: false } as any,
      },
    })
    await fiber.await()

    const md = ctx.get('marketData')
    expect(md).toBeDefined()
    await md!.provider('binance').getDerivatives!('BTCUSDT').catch(() => {})
    await md!.provider('okx').getDerivatives!('BTCUSDT').catch(() => {})
    expect(visited.length).toBeGreaterThan(0)
    for (const url of visited) {
      expect(url).not.toMatch(/usnbweb\.red|btmrvkxwhpn\.com|ouyi\.fit/)
    }
  })
})
