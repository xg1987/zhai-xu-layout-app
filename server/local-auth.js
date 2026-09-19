import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import express from 'express'
import { createApplication } from './app.js'

const directory = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(process.env.DATABASE_FILE || path.join(directory, 'local-auth.sqlite'))
db.pragma('journal_mode = WAL')
const { version } = JSON.parse(fs.readFileSync(path.join(directory, '../package.json'), 'utf8'))
const { app } = createApplication({ db, version,
 masterPath: process.env.VISION_MASTER_FILE || path.join(directory, '.vision-master-key'),
 secureCookie: process.env.NODE_ENV === 'production',
 origins: process.env.APP_ORIGIN ? [process.env.APP_ORIGIN] : ['http://127.0.0.1:5178', 'http://localhost:5178', 'http://127.0.0.1:5173', 'http://localhost:5173'],
})
if (process.env.NODE_ENV === 'production') {
 const dist = path.join(directory, '..', 'dist')
 app.use(express.static(dist))
 app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html'), { dotfiles: 'allow' }))
}
const port = Number(process.env.PORT) || 3001
app.listen(port, '127.0.0.1', () => console.log(`[api] listening on http://127.0.0.1:${port}`))
