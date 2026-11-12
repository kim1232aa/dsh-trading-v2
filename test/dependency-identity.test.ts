import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const roots: string[] = []
const guard = fileURLToPath(new URL('../scripts/dependency-identity.mjs', import.meta.url))
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'trading-deps-'))
  roots.push(root)
  for (const name of ['hub', 'provider']) {
    const dir = join(root, 'packages', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, devDependencies: { '@deepseek-ai/cordis': '^4.0.4' } }))
  }
  return root
}
function cordis(dir: string, version: string) {
  const dest = join(dir, 'node_modules', '@deepseek-ai', 'cordis')
  mkdirSync(dest, { recursive: true })
  writeFileSync(join(dest, 'package.json'), JSON.stringify({ name: '@deepseek-ai/cordis', version, main: 'index.js' }))
  writeFileSync(join(dest, 'index.js'), 'module.exports = {}')
}
// Do not let the harness's global NODE_PATH satisfy a deliberately missing dependency.
function run(root: string) { return spawnSync(process.execPath, [guard, root], { encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } }) }

describe('workspace Cordis identity guard', () => {
  it('accepts a shared package resolved through the workspace root', () => {
    const root = fixture()
    cordis(root, '4.0.4')
    const result = run(root)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('2 importers')
  })
  it('fails for nested independent installs instead of hiding a module augmentation split', () => {
    const root = fixture()
    cordis(root, '4.0.4')
    cordis(join(root, 'packages', 'hub'), '4.0.5')
    const result = run(root)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('hub')
    expect(result.stderr).toContain('provider')
  })
  it('also rejects separate runtime instances of the same version', () => {
    const root = fixture()
    cordis(root, '4.0.4')
    cordis(join(root, 'packages', 'provider'), '4.0.4')
    expect(run(root).status).toBe(1)
  })
  it('reports a missing direct dependency instead of reporting a clean install', () => {
    const result = run(fixture())
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('@deepseek-ai/cordis')
  })
})
