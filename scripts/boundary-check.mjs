#!/usr/bin/env node
/**
 * Architecture Layering and Dependency Boundary Guard.
 * Enforces strict directional imports across internal domain directories under src/:
 * - L0: market-data
 * - L1: providers, risk-guard, holdings, watchlist, knowledge, authority
 * - L2: tools, verdict, tasks-schedule
 * - L3: market-rpc, chart-view, client
 * - L4: index.ts (top-level composition)
 *
 * Invariant: Files in layer Ln may only import modules in layer Lm where m <= n,
 * except client/ may share pure indicator/payload helpers from tools/.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, join, relative, dirname } from 'node:path'

const ROOT_DIR = process.cwd()
const SRC_DIR = resolve(ROOT_DIR, 'src')

const DOMAIN_LAYER = {
  'market-data': 0,
  'providers': 1,
  'risk-guard': 1,
  'holdings': 1,
  'watchlist': 1,
  'knowledge': 1,
  'authority': 1,
  'tools': 2,
  'verdict': 2,
  'tasks-schedule': 2,
  'client': 3,
}

const CLIENT_SHARED_TOOLS = new Set([
  'tools/regime.ts',
  'tools/rsi-grid.ts',
  'tools/chart-payload.ts',
  'tools/signal.ts',
  'tools/revpoint.ts',
])

function layerOf(relPath) {
  const norm = relPath.replace(/\\/g, '/')
  if (norm === 'index.ts') return 4
  if (norm === 'market-rpc.ts' || norm === 'chart-view.ts') return 3
  const top = norm.split('/')[0]
  return DOMAIN_LAYER[top]
}

function walkTs(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkTs(full, out)
    else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

function checkBoundaries() {
  console.log('🔍 [Boundary Guard] Scanning internal domain boundaries under src/...\n')
  const files = walkTs(SRC_DIR)
  const violations = []
  let edges = 0

  const importRegex = /(?:from|import)\s+['"](\.[^'"]+)['"]/g
  for (const file of files) {
    const rel = relative(SRC_DIR, file).replace(/\\/g, '/')
    const srcLayer = layerOf(rel)
    if (srcLayer === undefined) continue

    const content = readFileSync(file, 'utf8')
    let m
    while ((m = importRegex.exec(content)) !== null) {
      const targetRaw = m[1].replace(/\.js$/, '.ts')
      const resolved = relative(SRC_DIR, resolve(dirname(file), targetRaw)).replace(/\\/g, '/')
      const targetLayer = layerOf(resolved)
      if (targetLayer === undefined) continue
      edges++

      // Allow client/* to import pure indicator helpers from tools/*
      if (srcLayer === 3 && targetLayer === 2 && CLIENT_SHARED_TOOLS.has(resolved)) continue

      if (targetLayer > srcLayer) {
        violations.push(`❌ [Layer Inversion] ${rel} (L${srcLayer}) imports ${resolved} (L${targetLayer})`)
      }
      if (srcLayer === 1 && targetLayer === 1 && rel.split('/')[0] !== resolved.split('/')[0]) {
        violations.push(`❌ [Cross-Domain L1] ${rel} imports sibling L1 domain ${resolved}`)
      }
    }
  }

  console.log(`✅ Checked ${edges} internal import edges across ${files.length} source files.`)
  if (violations.length > 0) {
    console.error('\n🚨 Architecture Boundary Check FAILED:\n' + violations.join('\n'))
    process.exit(1)
  }
  console.log('🎉 Architecture Boundary Check PASSED.\n')
}

checkBoundaries()
