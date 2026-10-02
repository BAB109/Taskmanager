/**
 * TaskFlow — db/migrate.js
 * Runs schema migrations idempotently (CREATE TABLE IF NOT EXISTS).
 * Safe to run multiple times — will not drop existing data.
 *
 * Run manually: node db/migrate.js
 * Or called automatically on server start.
 */

'use strict';

require('dotenv').config();

const db = require('./index');

const migrations = [
  // ── 001: scheduled_tasks ─────────────────────────────────────
  {
    name: '001_create_scheduled_tasks',
    sql: `
      CREATE TABLE IF NOT EXISTS scheduled_tasks (
        id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        name         VARCHAR(255)  NOT NULL,
        cat          VARCHAR(50)   NOT NULL DEFAULT 'other'
                                   CHECK (cat IN ('work','health','personal','study','other')),
        start_time   TIME          NOT NULL,
        end_time     TIME          NOT NULL,
        notes        TEXT          DEFAULT '',
        completed    BOOLEAN       NOT NULL DEFAULT FALSE,
        completed_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_time_order CHECK (end_time > start_time)
      );
    `,
  },

  // ── 002: todo_tasks ───────────────────────────────────────────
  {
    name: '002_create_todo_tasks',
    sql: `
      CREATE TABLE IF NOT EXISTS todo_tasks (
        id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        name         VARCHAR(255)  NOT NULL,
        cat          VARCHAR(50)   NOT NULL DEFAULT 'other'
                                   CHECK (cat IN ('work','health','personal','study','other')),
        priority     VARCHAR(20)   NOT NULL DEFAULT 'medium'
                                   CHECK (priority IN ('low','medium','high')),
        notes        TEXT          DEFAULT '',
        completed    BOOLEAN       NOT NULL DEFAULT FALSE,
        completed_at TIMESTAMPTZ,
        created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );
    `,
  },

  // ── 003: migrations tracking table ───────────────────────────
  {
    name: '003_create_migrations_table',
    sql: `
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL        PRIMARY KEY,
        name       VARCHAR(255)  UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );
    `,
  },

  // ── 004: auto-update updated_at via trigger ───────────────────
  {
    name: '004_updated_at_trigger',
    sql: `
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_scheduled_updated_at ON scheduled_tasks;
      CREATE TRIGGER trg_scheduled_updated_at
        BEFORE UPDATE ON scheduled_tasks
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      DROP TRIGGER IF EXISTS trg_todo_updated_at ON todo_tasks;
      CREATE TRIGGER trg_todo_updated_at
        BEFORE UPDATE ON todo_tasks
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `,
  },

  // ── 005: indexes for common queries ──────────────────────────
  {
    name: '005_indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_scheduled_start  ON scheduled_tasks (start_time);
      CREATE INDEX IF NOT EXISTS idx_scheduled_done   ON scheduled_tasks (completed);
      CREATE INDEX IF NOT EXISTS idx_todo_priority    ON todo_tasks (priority);
      CREATE INDEX IF NOT EXISTS idx_todo_done        ON todo_tasks (completed);
      CREATE INDEX IF NOT EXISTS idx_todo_created     ON todo_tasks (created_at DESC);
    `,
  },
];

async function runMigrations() {
  console.log('\n  🔄 Running database migrations...');

  // Ensure migrations table exists first
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL        PRIMARY KEY,
      name       VARCHAR(255)  UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    );
  `);

  // Get already-applied migrations
  const { rows: applied } = await db.query('SELECT name FROM _migrations');
  const appliedNames = new Set(applied.map(r => r.name));

  let count = 0;
  for (const migration of migrations) {
    if (appliedNames.has(migration.name)) {
      continue; // Already applied — skip
    }

    try {
      await db.query(migration.sql);
      await db.query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
      console.log(`  ✅ Applied : ${migration.name}`);
      count++;
    } catch (err) {
      console.error(`  ❌ Failed  : ${migration.name}`);
      console.error('     ', err.message);
      throw err; // Abort on failure
    }
  }

  if (count === 0) {
    console.log('  ✅ All migrations already up to date.');
  } else {
    console.log(`  🎉 Applied ${count} migration(s) successfully.`);
  }
}

// Allow running directly: node db/migrate.js
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { runMigrations };
