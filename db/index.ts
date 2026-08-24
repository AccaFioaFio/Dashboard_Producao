import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '@/db/schema'
import { DB_PATH, MIGRATIONS_DIR, ensureDataDirs } from '@/lib/paths'

let sqlite: Database.Database | null = null
let db: ReturnType<typeof drizzle<typeof schema>> | null = null

function applyMigrations(connection: Database.Database) {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `)

  const applied = new Set(
    connection
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map((row) => (row as { name: string }).name),
  )

  const files = ['0000_init.sql', '0001_cod_tecido.sql']
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    connection.exec('BEGIN')
    try {
      connection.exec(sql)
      connection
        .prepare(
          'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)',
        )
        .run(file, new Date().toISOString())
      connection.exec('COMMIT')
    } catch (error) {
      connection.exec('ROLLBACK')
      throw error
    }
  }
}

export function getSqlite() {
  if (sqlite) return sqlite
  ensureDataDirs()
  sqlite = new Database(DB_PATH)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  applyMigrations(sqlite)
  return sqlite
}

export function getDb() {
  if (db) return db
  db = drizzle(getSqlite(), { schema })
  return db
}

export function dbExists() {
  return existsSync(DB_PATH)
}

export type AppDb = ReturnType<typeof getDb>
