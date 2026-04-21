import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import pg from 'pg'

const { Client } = pg

function arg(name, fallback = undefined) {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx >= 0) return process.argv[idx + 1]
  return fallback
}

const url =
  arg('url', process.env.DATABASE_URL) ??
  (() => {
    throw new Error('Missing --url (or DATABASE_URL)')
  })()

const file = arg('file', path.join('..', 'scripts', 'init-railway-db.sql'))
const resetRaw = arg('reset', process.env.DBSEED_RESET ?? 'true')
const reset = String(resetRaw).toLowerCase() !== 'false'

const sqlText = (await readFile(file, 'utf8')).trim()
if (!sqlText) throw new Error(`SQL file is empty: ${file}`)

const client = new Client({ connectionString: url })
await client.connect()

try {
  if (reset) {
    await client.query(`
      DROP SCHEMA IF EXISTS public CASCADE;
      CREATE SCHEMA public;
      GRANT ALL ON SCHEMA public TO postgres;
      GRANT ALL ON SCHEMA public TO public;
    `)
  }

  await client.query(sqlText)
  console.log('OK: schema+seed applied successfully')
} finally {
  await client.end()
}

