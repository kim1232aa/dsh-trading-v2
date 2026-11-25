/**
 * Unified single-package build for `dsh-trading`:
 * 1. Check Cordis single-instance identity.
 * 2. Build Host half (src/*.ts excluding src/client/**) -> lib/*.js + lib/*.d.ts
 * 3. Emit Client type declarations (src/client/**) -> lib/types/client/*.d.ts
 * 4. Bundle Browser half (src/client/index.ts) -> lib/client.js + lib/client.js.map
 *    wrapped in window.__ModuleLoader__.load({ id: 'dsh-trading', factory })
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN_ID = 'dsh-trading'

const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-tool',
  '@deepseek-ai/dsh-client-ui-tool/client',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/dsh-client-connection/client',
  '@deepseek-ai/dsh-client-ui-conversation',
  '@deepseek-ai/dsh-client-ui-conversation/client',
  '@deepseek-ai/dsh-client-ui-theme',
  '@deepseek-ai/dsh-client-ui-theme/client',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-locale/client',
  '@deepseek-ai/dsh-client-shortcuts',
  '@deepseek-ai/dsh-client-shortcuts/client',
]

execFileSync(process.execPath, [resolve(root, 'scripts/dependency-identity.mjs'), root], {
  stdio: 'inherit',
})

const tsc = resolve(root, 'node_modules/typescript/bin/tsc')
execFileSync(process.execPath, [tsc, '-p', resolve(root, 'tsconfig.json')], { stdio: 'inherit' })
execFileSync(process.execPath, [tsc, '-p', resolve(root, 'tsconfig.client.json')], { stdio: 'inherit' })

await build({
  entryPoints: [resolve(root, 'src/client/index.ts')],
  outfile: resolve(root, 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: EXTERNALS,
  charset: 'utf8',
  logLevel: 'warning',
  sourcemap: true,
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`
      + ' var module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: 'return module.exports; } });' },
})

// Keep Apache-2.0 attribution for overlays adapted from @klinecharts/pro inside the published lib/.
mkdirSync(resolve(root, 'lib/overlays'), { recursive: true })
copyFileSync(resolve(root, 'src/client/overlays/NOTICE'), resolve(root, 'lib/overlays/NOTICE'))
