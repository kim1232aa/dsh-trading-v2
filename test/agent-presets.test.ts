import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..')

describe('bundle ships trading + analyst agent presets', () => {
  const patch = readFileSync(join(root, 'bundle/trading/cordis.patch.yml'), 'utf8')

  it('declares preset-trading and preset-analyst with official ids', () => {
    expect(patch).toMatch(/id:\s*preset-trading/)
    expect(patch).toMatch(/id:\s*preset-analyst/)
    expect(patch).toMatch(/name:\s*'@deepseek-ai\/dsh-agent-preset'/)
    // config.id is what the session picker selects
    expect(patch).toMatch(/\bid:\s*trading\b/)
    expect(patch).toMatch(/\bid:\s*analyst\b/)
  })

  it('persona rows use official prefix (not text)', () => {
    // Each dsh-persona config must open with prefix:, never text:
    const personaBlocks = patch.split("name: '@deepseek-ai/dsh-persona'")
    expect(personaBlocks.length).toBeGreaterThanOrEqual(3) // split → 1 + N
    for (const block of personaBlocks.slice(1)) {
      const head = block.slice(0, 200)
      expect(head).toMatch(/config:\s*\n\s+prefix:/)
      expect(head).not.toMatch(/config:\s*\n\s+text:/)
    }
  })

  it('does not remount tool-market inside the preset plugin lists', () => {
    // Grab from first preset-trading insert through end — tool-market appears
    // earlier as a profile row, which is correct; it must not reappear under
    // either preset's plugins: list.
    const tradingIdx = patch.indexOf('id: preset-trading')
    const analystIdx = patch.indexOf('id: preset-analyst')
    expect(tradingIdx).toBeGreaterThan(-1)
    expect(analystIdx).toBeGreaterThan(-1)
    const presetRegion = patch.slice(Math.min(tradingIdx, analystIdx))
    expect(presetRegion).not.toMatch(/@dsh-trading\/tool-market/)
  })
})

describe('presets/*/agent.cordis.yml mirrors use prefix', () => {
  for (const id of ['trading', 'analyst'] as const) {
    it(`${id} agent.cordis.yml`, () => {
      const path = join(root, 'presets', id, 'agent.cordis.yml')
      expect(existsSync(path)).toBe(true)
      const body = readFileSync(path, 'utf8')
      expect(body).toMatch(/name:\s*'@deepseek-ai\/dsh-persona'/)
      expect(body).toMatch(/prefix:\s*\|/)
      expect(body).not.toMatch(/^\s+text:\s*\|/m)
    })
  }
})

/** Strip the common indent of a YAML block scalar body and join with \n. */
function blockAt(lines: string[], start: number): string {
  const ind = (lines[start]!.match(/^(\s*)/)![1] ?? '').length
  const body: string[] = []
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]!
    if (l.trim() === '') { body.push(''); continue }
    if ((l.match(/^(\s*)/)![1] ?? '').length <= ind) break
    body.push(l)
  }
  while (body.length > 0 && body[body.length - 1] === '') body.pop()
  const min = Math.min(...body.filter(l => l !== '').map(l => (l.match(/^(\s*)/)![1] ?? '').length))
  return body.map(l => (l === '' ? '' : l.slice(min))).join('\n')
}

const norm = (s: string): string => s.replace(/\r\n/g, '\n')

/** The persona prefix as the bundle patch ships it. */
function patchPrefix(patch: string, id: 'trading' | 'analyst'): string {
  const lines = norm(patch).split('\n')
  const at = lines.findIndex(l => new RegExp(`id:\\s*preset-${id}\\b`).test(l))
  const p = lines.findIndex((l, i) => i > at && /^\s+prefix:\s*\|/.test(l))
  return blockAt(lines, p)
}

/** The persona prefix as presets/<id>/agent.cordis.yml mirrors it. */
function mirrorPrefix(id: 'trading' | 'analyst'): string {
  const lines = norm(readFileSync(join(root, 'presets', id, 'agent.cordis.yml'), 'utf8')).split('\n')
  return blockAt(lines, lines.findIndex(l => /^\s+prefix:\s*\|/.test(l)))
}

function patchDescription(patch: string, id: 'trading' | 'analyst'): string {
  const lines = norm(patch).split('\n')
  const at = lines.findIndex(l => new RegExp(`id:\\s*preset-${id}\\b`).test(l))
  const line = lines.find((l, i) => i > at && /^\s+description:/.test(l)) ?? ''
  return line.replace(/^\s+description:\s*/, '').trim()
}

function presetYmlDescription(id: 'trading' | 'analyst'): string {
  const line = norm(readFileSync(join(root, 'presets', id, 'preset.yml'), 'utf8')).split('\n').find(l => /^description:/.test(l)) ?? ''
  return line.replace(/^description:\s*/, '').trim()
}

describe('presets tell the analysis through resolve_symbol + walkthrough', () => {
  const patch = readFileSync(join(root, 'bundle/trading/cordis.patch.yml'), 'utf8')

  for (const id of ['trading', 'analyst'] as const) {
    it(`${id}: the bundle patch and the presets/ mirror carry the same persona`, () => {
      expect(mirrorPrefix(id)).toBe(patchPrefix(patch, id))
    })

    it(`${id}: names go through resolve_symbol and the analysis is told with walkthrough`, () => {
      const text = patchPrefix(patch, id)
      expect(text).toContain('resolve_symbol')
      expect(text).toContain('walkthrough')
      expect(text).toContain('keep: true')
      expect(text).toMatch(/\bask\b/)
      expect(text).toContain('annotate_chart')
    })

    it(`${id}: preset.yml and the patch row describe the preset the same way`, () => {
      expect(patchDescription(patch, id)).toBe(presetYmlDescription(id))
    })
  }

  it('analyst: no second tool-market mount, and the description is the walkthrough one', () => {
    expect(patch).not.toMatch(/analyst-tools/)
    expect(presetYmlDescription('analyst')).toMatch(/talks you through your chart/)
  })

  it('trading: keeps the derivatives, structure and pattern disciplines', () => {
    const text = patchPrefix(patch, 'trading')
    for (const must of [
      'market_snapshot', 'large_orders', 'find_swing_points', 'find_supply_demand_zones',
      'screen_market', 'run_backtest', '艾略特', 'XABCD', 'Gartley', 'closesBeyond', 'get_chart_view',
    ]) expect(text, must).toContain(must)
  })

  it('trading: supply and demand zones come only from find_supply_demand_zones', () => {
    const text = patchPrefix(patch, 'trading')
    expect(text).toMatch(/只能用 `find_supply_demand_zones`/)
    expect(text).toMatch(/不叫供给区/)
  })

  it('trading: wall prints are never called support by themselves', () => {
    expect(patchPrefix(patch, 'trading')).toMatch(/墙[^。\n]*(可随时撤|不等于支撑)/)
  })
})
