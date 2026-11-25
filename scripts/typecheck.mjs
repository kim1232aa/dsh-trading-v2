#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const tsc = resolve(root, 'node_modules/typescript/bin/tsc')

execFileSync(process.execPath, [resolve(root, 'scripts/dependency-identity.mjs'), root], { stdio: 'inherit' })
execFileSync(process.execPath, [tsc, '-p', resolve(root, 'tsconfig.json'), '--noEmit'], { stdio: 'inherit' })
execFileSync(process.execPath, [tsc, '-p', resolve(root, 'tsconfig.client.json'), '--noEmit'], { stdio: 'inherit' })
execFileSync(process.execPath, [tsc, '-p', resolve(root, 'tsconfig.test.json'), '--noEmit'], { stdio: 'inherit' })
