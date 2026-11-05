import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const packageInfo = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const versionAsset = {
  name: 'release-version',
  generateBundle() {
    const commit = process.env.ZHAI_XU_RELEASE_COMMIT || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: packageInfo.version, commit }) + '\n' })
  },
}

export default defineConfig({
  plugins: [react(), versionAsset],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
})
