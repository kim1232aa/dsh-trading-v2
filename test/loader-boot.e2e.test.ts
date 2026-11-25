// Keyless real-entry-path smoke: boot a real `dsh web` process under a
// throwaway DSH_HOME, load the built single-package `dsh-trading`, and verify:
// 1. All 33 model tools + providers + browser client module (`dsh-trading`) activate.
// 2. The root `cordis.patch.yml` disables `ui-layout` when `dsh-trading` is enabled,
//    and automatically re-enables `ui-layout` when `dsh-trading` is disabled (anti-brick).
import { afterEach, describe, expect, it } from 'vitest'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(__dirname, '..')
const entryFile = join(root, 'lib', 'index.js')
const built = existsSync(entryFile) && existsSync(join(root, 'lib', 'client.js'))

interface DshLauncher {
  cmd: string
  prefixArgs: string[]
  env: Record<string, string>
}

function resolveDshLauncher(): DshLauncher | null {
  if (process.platform === 'win32') {
    const localAppData = process.env['LOCALAPPDATA']
    const appData = process.env['APPDATA']
    if (localAppData && appData) {
      const nodeExe = join(localAppData, 'DSH Tauri', 'runtime', 'win32-x64', 'DSH Tauri.exe')
      const asarNative = join(localAppData, 'deepseek-harness', 'bin', 'asar-native.cjs')
      const asarFile = join(appData, 'dsh-tauri', 'dependencies', 'dsh', 'deepseek-harness-pkg-windows.asar')
      const binJs = join(asarFile, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
      if (existsSync(nodeExe) && existsSync(asarNative) && existsSync(asarFile)) {
        const probe = spawnSync(nodeExe, ['--require', asarNative, binJs, '--version'], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', DSH_TELEMETRY_DISABLED: '1' },
          encoding: 'utf8',
        })
        if (probe.status === 0) {
          return {
            cmd: nodeExe,
            prefixArgs: ['--require', asarNative, binJs],
            env: { ELECTRON_RUN_AS_NODE: '1', DSH_TELEMETRY_DISABLED: '1' },
          }
        }
      }
    }
  }
  const direct = spawnSync('dsh', ['--version'], { encoding: 'utf8' })
  if (direct.status === 0) {
    return { cmd: 'dsh', prefixArgs: [], env: { DSH_TELEMETRY_DISABLED: '1' } }
  }
  return null
}

const launcher = resolveDshLauncher()

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const a = s.address(); s.close(() => typeof a === 'object' && a ? res(a.port) : rej(new Error('no port')))
    })
  })
}

let child: ChildProcess | undefined
let dir: string | undefined
afterEach(async () => {
  if (child && child.pid) {
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        child.kill('SIGTERM')
      }
    } catch {}
    child = undefined
  }
  if (dir) await rm(dir, { recursive: true, force: true }); dir = undefined
})

interface ProbeResult {
  tools: string[]
  providers: string[] | null
  clientEntries: string[]
  uiLayoutDisabled: boolean | null
}

async function boot(patchYaml: string): Promise<ProbeResult> {
  if (!launcher) throw new Error('dsh launcher not found')
  dir = await mkdtemp(join(tmpdir(), 'dsh-trading-boot-'))
  await mkdir(join(dir, 'home'))
  await mkdir(join(dir, 'ws'))
  await mkdir(join(dir, 'data'))
  // Copy probe outside repo root so nearestPackage doesn't map probe to dsh-trading/package.json.
  const probeFile = join(dir, 'loader-probe.mjs')
  copyFileSync(join(__dirname, 'fixtures', 'loader-probe.mjs'), probeFile)

  const patch = join(dir, 'patch.yml')
  const body = patchYaml.replaceAll('$DIR', dir.replace(/\\/g, '/'))
    + `\n- insert:\n    - id: probe\n      name: '${probeFile.replace(/\\/g, '/')}'\n`
  await writeFile(patch, body)
  const port = await freePort()
  const env: Record<string, string | undefined> = { ...process.env, ...launcher.env, DSH_HOME: join(dir, 'home') }
  for (const k of Object.keys(env)) if (/API_KEY$/.test(k)) delete env[k]
  child = spawn(launcher.cmd, [...launcher.prefixArgs, 'web', '--patch', patch, '--port', String(port), '--no-open'], {
    cwd: join(dir, 'ws'),
    env: env as NodeJS.ProcessEnv,
  })
  return await new Promise((res, rej) => {
    let out = ''
    const timer = setTimeout(() => rej(new Error('no probe marker; output:\n' + out)), 80_000)
    const on = (b: Buffer) => {
      out += b
      const m = /DSH_TRADING_PROBE (\{.*\})/.exec(out)
      if (m) { clearTimeout(timer); res(JSON.parse(m[1]!)) }
    }
    child!.stdout!.on('data', on); child!.stderr!.on('data', on)
    child!.on('exit', code => { clearTimeout(timer); rej(new Error(`dsh exited ${code}:\n${out}`)) })
  })
}

describe.skipIf(!launcher || !built)('real dsh Loader boot (keyless, single package)', () => {
  it('activates unified dsh-trading package, all 33 tools, providers, and client bundle', async () => {
    const entry = entryFile.replace(/\\/g, '/')
    const r = await boot(`
- id: ui-layout
  disabled: !!js "(ctx[Symbol.for('cordis.entry')]?.parent?.data ?? []).some(r => r.id === 'dsh-trading' && !r.disabled && r.config?.tradingFrame !== false)"
- insert:
    - id: dsh-trading
      name: '${entry}'
      config:
        dataDir: '$DIR/data'
        chartDir: '$DIR/ws/charts'
`)
    expect(r.tools).toEqual(expect.arrayContaining([
      'list_symbols', 'resolve_symbol', 'get_ohlcv', 'market_snapshot',
      'walkthrough', 'annotate_chart', 'find_swing_points', 'find_supply_demand_zones',
      'large_orders', 'audit_backtest', 'get_holdings', 'get_watchlist',
      'record_thesis', 'check_trade_authority', 'list_scheduled_tasks', 'get_chart_view',
    ]))
    expect(r.tools).toHaveLength(33)
    expect(r.providers).toEqual(expect.arrayContaining(['csv', 'cn', 'binance', 'okx']))
    expect(r.clientEntries).toContain('dsh-trading')
    expect(r.uiLayoutDisabled).toBe(true)
  }, 120_000)

  it('re-enables stock ui-layout automatically when dsh-trading is disabled', async () => {
    const entry = entryFile.replace(/\\/g, '/')
    const r = await boot(`
- id: ui-layout
  disabled: !!js "(ctx[Symbol.for('cordis.entry')]?.parent?.data ?? []).some(r => r.id === 'dsh-trading' && !r.disabled && r.config?.tradingFrame !== false)"
- insert:
    - id: dsh-trading
      name: '${entry}'
      disabled: true
`)
    expect(r.tools).toEqual([])
    expect(r.providers).toBeNull()
    expect(r.clientEntries).not.toContain('dsh-trading')
    expect(r.uiLayoutDisabled).toBe(false)
  }, 120_000)
})
