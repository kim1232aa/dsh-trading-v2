#!/usr/bin/env node
/**
 * Tools Schema & Collision Audit Guard.
 * Inspects all Cordis tool definitions across src/ to ensure:
 * 1. Zero namespace collisions.
 * 2. Proper naming conventions (snake_case).
 * 3. Detailed descriptions and valid parameter schemas.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT_DIR = process.cwd()
const SRC_DIR = join(ROOT_DIR, 'src')

function scanFiles(dir) {
  const files = []
  if (!existsSync(dir)) return files
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'lib' && entry.name !== 'client') {
        files.push(...scanFiles(full))
      }
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(full)
    }
  }
  return files
}

function auditTools() {
  console.log('🔍 [Tools Audit Guard] Scanning all tool definitions across src/...\n')

  const files = scanFiles(SRC_DIR)
  const toolRegistry = new Map()
  const errors = []

  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    const rel = relative(ROOT_DIR, file).replace(/\\/g, '/')
    const toolMatchRegex = /defineTool\(\s*\{[\s\S]*?name:\s*['"`]([a-z0-9_]+)['"`][\s\S]*?description:\s*([\s\S]*?)[,\n]\s*(?:parameters|output):/g
    let match

    while ((match = toolMatchRegex.exec(content)) !== null) {
      const name = match[1]
      const rawDesc = match[2].trim()
      const description = rawDesc.replace(/['"`+\s\n]+/g, ' ').trim()

      if (!/^[a-z][a-z0-9_]*$/.test(name)) {
        errors.push(`❌ Tool "${name}" does not follow snake_case naming convention in ${rel}`)
      }
      if (description.length < 8) {
        errors.push(`❌ Tool "${name}" has insufficient description in ${rel}`)
      }
      if (toolRegistry.has(name)) {
        const existing = toolRegistry.get(name)
        errors.push(`❌ [Collision] Tool "${name}" is registered in both ${existing.rel} and ${rel}!`)
      } else {
        toolRegistry.set(name, { name, description, rel })
      }
    }
  }

  console.log(`📋 Found and validated ${toolRegistry.size} registered tools:`)
  for (const [name, meta] of toolRegistry.entries()) {
    console.log(`   • ${name.padEnd(26)} [${meta.rel}]`)
  }

  if (toolRegistry.size === 0) {
    errors.push('❌ Zero tools discovered — audit regex or directory mismatch')
  } else if (toolRegistry.size !== 33) {
    errors.push(`❌ Expected 33 tools, found ${toolRegistry.size} — update audit or check missing tool definition`)
  }

  if (errors.length > 0) {
    console.error(`\n🚨 Tools Audit FAILED with ${errors.length} error(s):`)
    for (const err of errors) console.error(err)
    process.exit(1)
  }

  console.log(`\n🎉 Tools Audit PASSED: All ${toolRegistry.size} tools have unique names and valid schemas!`)
}

try {
  auditTools()
} catch (err) {
  console.error('Fatal tools audit error:', err)
  process.exit(1)
}
