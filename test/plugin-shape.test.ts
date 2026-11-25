import { describe, expect, it } from 'vitest'
import { join } from 'node:path'

// Every host plugin must export apply + an inject ARRAY of service names.
// cordis treats each key of an inject map as required, and a bare default
// function export is resolved as the plugin itself (losing `inject`).
const root = join(__dirname, '..')
const entries = [
  'src/index.ts',
  'src/providers/csv.ts',
  'src/providers/cn.ts',
  'src/providers/binance.ts',
  'src/providers/coinglass/index.ts',
  'src/providers/futu/index.ts',
  'src/risk-guard/index.ts',
  'src/tools/index.ts',
  'src/verdict/index.ts',
  'src/holdings/index.ts',
  'src/watchlist/index.ts',
  'src/knowledge/index.ts',
  'src/authority/index.ts',
  'src/tasks-schedule/index.ts',
]

describe('plugin module shape', () => {
  for (const rel of entries) {
    it(rel, async () => {
      const mod = await import(join(root, rel))
      if (typeof mod.apply !== 'function') return
      expect(typeof mod.name).toBe('string')
      expect((mod.name as string).length).toBeGreaterThan(0)
      expect(Array.isArray(mod.inject ?? [])).toBe(true)
      for (const s of mod.inject ?? []) expect(['tools', 'marketData']).toContain(s)
      expect('default' in mod).toBe(false)
    })
  }

  it('unified host entry exports dsh-trading with empty inject and Config', async () => {
    const mod = await import(join(root, 'src/index.ts'))
    expect(mod.name).toBe('dsh-trading')
    expect(mod.inject).toEqual([])
    expect(typeof mod.apply).toBe('function')
    expect(mod.Config).toBeDefined()
    expect('default' in mod).toBe(false)
  })
})
