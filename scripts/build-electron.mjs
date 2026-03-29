import { build } from 'esbuild'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

await build({
  entryPoints: [
    join(root, 'electron/main.ts'),
    join(root, 'electron/preload.ts'),
  ],
  outdir: join(root, 'dist-electron'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['electron'],
})
