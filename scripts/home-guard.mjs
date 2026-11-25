#!/usr/bin/env node
/**
 * Home & Workspace Safety Guard (Zero-Pollution Invariant).
 * Audits source code, cordis.patch.yml, presets, and scripts to ensure:
 * 1. No hardcoded personal or sensitive local home directory paths.
 * 2. All file stores, caches, and logs use isolated relative paths or OS homedir/DSH_HOME at runtime.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT_DIR = process.cwd()

const FORBIDDEN_PATTERNS = [
  { regex: /[a-zA-Z]:\\Users\\[a-zA-Z0-9_\-\.]+(?!\\[a-zA-Z0-9_\-\.]*default-workspace)/i, label: 'Hardcoded Windows User Home' },
  { regex: /\/home\/[a-zA-Z0-9_\-\.]+/i, label: 'Hardcoded Linux User Home' },
  { regex: /\/Users\/[a-zA-Z0-9_\-\.]+/i, label: 'Hardcoded macOS User Home' },
]

function scanDirectory(dir, fileList = []) {
  if (!existsSync(dir)) return fileList
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'lib' && entry.name !== 'dist' && entry.name !== '.git') {
        scanDirectory(full, fileList)
      }
    } else if (entry.isFile() && /\.(ts|tsx|js|mjs|json|yml|yaml)$/.test(entry.name)) {
      if (!entry.name.endsWith('package-lock.json') && !entry.name.endsWith('pnpm-lock.yaml')) {
        fileList.push(full)
      }
    }
  }
  return fileList
}

function auditHomeSafety() {
  console.log('🛡️  [Home Safety Guard] Auditing codebase against hardcoded host paths & leaks...\n')

  const filesToScan = [
    ...scanDirectory(join(ROOT_DIR, 'src')),
    ...scanDirectory(join(ROOT_DIR, 'presets')),
    ...scanDirectory(join(ROOT_DIR, 'scripts')),
    join(ROOT_DIR, 'cordis.patch.yml'),
    join(ROOT_DIR, 'package.json'),
  ].filter(f => existsSync(f))

  const violations = []

  for (const file of filesToScan) {
    if (file.endsWith('home-guard.mjs')) continue

    const content = readFileSync(file, 'utf-8')
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.regex.test(line)) {
          violations.push({
            file,
            line: i + 1,
            label: pattern.label,
            snippet: line.trim().slice(0, 100),
          })
        }
      }
    }
  }

  console.log(`🔍 Scanned ${filesToScan.length} source files across repository.`)

  if (violations.length > 0) {
    console.error(`\n🚨 Home Safety Guard FAILED with ${violations.length} violation(s):`)
    for (const v of violations) {
      console.error(`  ❌ [${v.label}] ${v.file}:${v.line} -> "${v.snippet}"`)
    }
    process.exit(1)
  }

  console.log('\n🎉 Home Safety Guard PASSED: Zero hardcoded host user paths detected!')
}

try {
  auditHomeSafety()
} catch (err) {
  console.error('Fatal home guard error:', err)
  process.exit(1)
}
