/**
 * TaskFlow — db/index.js
 * PostgreSQL connection pool using the `pg` library.
 * Reads config from environment variables (via .env).
 */

'use strict';

const { Pool } = require('pg');

// Build pool config — DATABASE_URL takes full priority
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      // Neon and most cloud providers require SSL; allow self-signed certs
      ssl: { rejectUnauthorized: false },
    }
  : {
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME     || 'taskflow',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool({
  ...poolConfig,
  max:              10,    // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Log pool errors (avoid unhandled promise rejections)
pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Execute a query using the pool.
 * @param {string} text   - SQL string (use $1, $2 ... for params)
 * @param {Array}  params - Parameterized values
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const ms = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DB] ${ms}ms | rows: ${result.rowCount} | ${text.slice(0, 80)}`);
    }
    return result;
  } catch (err) {
    console.error('[DB] Query error:', err.message, '\nSQL:', text);
    throw err;
  }
}

/**
 * Get a dedicated client for transactions.
 * Caller is responsible for client.release().
 */
async function getClient() {
  return pool.connect();
}

/**
 * Test the connection — call on startup.
 */
async function testConnection() {
  const result = await query('SELECT current_database() AS db, version() AS ver');
  const { db, ver } = result.rows[0];
  console.log(`  🐘 PostgreSQL Connected`);
  console.log(`  📦 Database : ${db}`);
  console.log(`  🔖 Version  : ${ver.split(',')[0]}`);
}

module.exports = { query, getClient, pool, testConnection };
