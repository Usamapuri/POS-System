/**
 * Re-seed a remote Postgres using database/init/03_truncate + 02_seed_data.sql.
 * Usage (from repo root or frontend/):
 *   DATABASE_URL=postgresql://... node frontend/scripts/seed-remote-demo.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const truncatePath = path.join(repoRoot, 'database', 'init', '03_truncate_demo_app_data.sql')
const seedPath = path.join(repoRoot, 'database', 'init', '02_seed_data.sql')

const dsn = process.env.DATABASE_URL
if (!dsn) {
  console.error('Set DATABASE_URL')
  process.exit(1)
}

/** Remove `-- …` from each line so semicolons inside comments do not split statements. */
function stripLineComments(s) {
  return s
    .split('\n')
    .map((line) => {
      const i = line.indexOf('--')
      if (i === -1) return line
      return line.slice(0, i)
    })
    .join('\n')
}

function splitSQLStatements(s) {
  s = stripLineComments(s.replace(/\r\n/g, '\n'))
  const out = []
  let b = ''
  let inQuote = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "'") {
      inQuote = !inQuote
      b += c
      continue
    }
    if (c === ';' && !inQuote) {
      const stmt = b.trim()
      if (stmt && !isCommentOnly(stmt)) out.push(stmt)
      b = ''
      continue
    }
    b += c
  }
  const last = b.trim()
  if (last && !isCommentOnly(last)) out.push(last)
  return out
}

function isCommentOnly(stmt) {
  const lines = stmt.split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (!t.startsWith('--')) return false
  }
  return true
}

async function execFile(client, filePath, label) {
  const sql = fs.readFileSync(filePath, 'utf8')
  const stmts = splitSQLStatements(sql)
  await client.query('BEGIN')
  try {
    for (let i = 0; i < stmts.length; i++) {
      await client.query(stmts[i])
    }
    await client.query('COMMIT')
    console.log(`${label} OK (${stmts.length} statements)`)
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  }
}

const client = new pg.Client({ connectionString: dsn, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  await execFile(client, truncatePath, 'truncate')
  await execFile(client, seedPath, 'seed')
  console.log('Done. Logins: admin / inventory1 / counter1 / counter2 / kitchen1 — password admin123')
} finally {
  await client.end()
}
