#!/usr/bin/env node
/** Catch independent Cordis installs before their module augmentations split. */
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? process.cwd())
const dependency = '@deepseek-ai/cordis'
const importers = [root]
for (const parent of ['packages', 'bundle']) {
  const dir = join(root, parent)
  if (!existsSync(dir)) continue
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) importers.push(join(dir, entry.name))
  }
}
const resolved = []
const failures = []
for (const dir of importers) {
  const path = join(dir, 'package.json')
  if (!existsSync(path)) continue
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  if (!['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
    .some(key => Object.hasOwn(manifest[key] ?? {}, dependency))) continue
  try {
    const entry = realpathSync(createRequire(path).resolve(dependency))
    resolved.push({ name: manifest.name ?? relative(root, dir), entry })
  } catch (error) {
    failures.push(
      (manifest.name ?? relative(root, dir)) + ': ' + (error instanceof Error ? error.message : String(error))
    )
  }
}
if (new Set(resolved.map(row => row.entry)).size > 1) {
  failures.push('Split Cordis instances:')
  for (const row of resolved) failures.push(row.name + ' -> ' + row.entry)
}
if (failures.length > 0) {
  console.error(dependency + ' identity check failed:\n' + failures.join('\n'))
  console.error('Restore workspace dependencies from the root lockfile before building.')
  process.exitCode = 1
} else {
  console.log('Cordis identity check passed: ' + resolved.length + ' importers share one instance.')
}
