/**
 * Live provider + tool harness (no LLM). Run from repo root:
 *   node scripts/real-harness.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { apply, name, Config } from '../lib/index.js'

const root = join(tmpdir(), 'dsh-trading-real-harness')
mkdirSync(join(root, 'data/holdings'), { recursive: true })
mkdirSync(join(root, 'charts'), { recursive: true })

const ctx = new Context()
const toolMap = new Map()
ctx.reflect.provide('tools', {
  register(tool) { toolMap.set(tool.name, tool); return () => toolMap.delete(tool.name) },
})

const fiber = ctx.plugin({ name, inject: [], Config, apply }, {
  dataDir: join(root, 'data'),
  chartDir: join(root, 'charts'),
})
await fiber.await()

const marketData = ctx.get('marketData')
marketData.provider('csv')

const report = []
async function run(toolName, args) {
  const tool = toolMap.get(toolName)
  if (!tool) { report.push({ name: toolName, ok: false, detail: 'missing tool' }); return }
  try {
    const out = await tool.execute(args, {})
    const rendered = tool.output?.render?.(args, out)
    const text = Array.isArray(rendered)
      ? rendered.map(x => x.text).filter(Boolean).join('\n')
      : JSON.stringify(out)
    report.push({ name: `${toolName} ${JSON.stringify(args).slice(0, 90)}`, ok: true, detail: String(text).slice(0, 600) })
    return out
  } catch (e) {
    report.push({ name: `${toolName} ${JSON.stringify(args).slice(0, 90)}`, ok: false, detail: String(e).slice(0, 400) })
  }
}

console.log('providers', marketData.list())
console.log('resolve BTCUSDT ->', marketData.resolveProvider('BTCUSDT').id)
console.log('resolve 600519 ->', marketData.resolveProvider('600519').id)
console.log('tools', [...toolMap.keys()].sort().join(', '))

await run('list_symbols', { provider: 'binance' })
await run('list_symbols', { provider: 'cn' })
await run('market_snapshot', { symbol: 'BTCUSDT', timeframes: ['1h'], bars: 100 })
await run('market_snapshot', { symbol: '600519', timeframes: ['1d'], bars: 100 })
await run('get_ohlcv', { symbol: 'ETHUSDT', timeframe: '15m', limit: 20 })
await run('get_ohlcv', { symbol: '000001', timeframe: '1d', limit: 15 })
await run('get_holdings', {})
await run('add_to_watchlist', { symbol: 'BTCUSDT', group: 'crypto' })
await run('get_watchlist', {})
await run('list_scheduled_tasks', {})
await run('check_trade_authority', { action: 'place_order', symbol: 'BTCUSDT', side: 'buy', quantity: 1 })
await run('screen_market', { pattern: 'bullish_alignment', provider: 'binance' })
await run('find_swing_points', { symbol: 'BTCUSDT', timeframe: '1h', bars: 100 })

let p = 0, f = 0
const lines = ['# dsh-trading real harness', `time: ${new Date().toISOString()}`, '']
for (const r of report) {
  r.ok ? p++ : f++
  console.log(`\n${r.ok ? 'OK' : 'FAIL'}  ${r.name}`)
  console.log('  ' + r.detail.replace(/\n/g, '\n  '))
  lines.push(`## ${r.ok ? 'OK' : 'FAIL'} ${r.name}`, '```', r.detail, '```', '')
}
lines.push(`passed=${p} failed=${f}`)
writeFileSync(join(root, 'trading-real-harness.md'), lines.join('\n'))
console.log(`\n==== SUMMARY passed=${p} failed=${f} ====`)
process.exit(f ? 1 : 0)
