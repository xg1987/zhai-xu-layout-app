import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { ensureSchema } from '../cloudflare/accounts.js'
import { ROOM_SCANS_SCHEMA } from '../cloudflare/rooms.js'

const remote = process.argv.includes('--remote')
if (process.argv.some(argument => argument.startsWith('--') && !['--remote', '--local'].includes(argument))) throw new Error('Use --local or --remote')
const run = args => execFileSync('npx', ['--no-install', 'wrangler', ...args], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
if (remote) {
  const identity = run(['whoami'])
  if (!/associated with the email marsxiong19@gmail\.com\b/i.test(identity)) throw new Error('Cloudflare account must be marsxiong19@gmail.com; no database changes were made')
}

function execute(sql) {
  const output = run(['d1', 'execute', 'DB', remote ? '--remote' : '--local', '--json', '--command', sql])
  const result = JSON.parse(output)
  if (!Array.isArray(result) || result.some(item => item.success === false)) throw new Error('D1 schema command failed')
  return result
}
const db = {
  prepare(sql) {
    return { sql, all: async () => ({ results: execute(sql)[0].results }), run: async () => execute(sql)[0] }
  },
  batch: async statements => execute(statements.map(statement => statement.sql).join(';\n')),
}

// Every change is additive and repeatable. Existing accounts, hashes, sessions,
// roles, model keys and records are never imported, reset or replaced here.
execute(readFileSync(new URL('../migrations/0001_auth.sql', import.meta.url), 'utf8'))
await ensureSchema({ DB: db })
execute(readFileSync(new URL('../cloudflare/vision-schema.sql', import.meta.url), 'utf8'))
execute(ROOM_SCANS_SCHEMA.join(';\n'))
console.log(`Cloudflare ${remote ? 'production' : 'local'} schema ready; existing data preserved.`)
