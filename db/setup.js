/**
 * TaskFlow — db/setup.js
 * One-time script to create the `taskflow` database.
 * Run this ONCE before starting the server:
 *   node db/setup.js
 *
 * It connects to the `postgres` default database first,
 * creates `taskflow` if it doesn't exist, then exits.
 */

'use strict';

require('dotenv').config();

const { Client } = require('pg');

async function setupDatabase() {
  // Connect to the default `postgres` database to create our DB
  const client = new Client({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432', 10),
    database: 'postgres',                              // connect to system DB first
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || '',
    ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  const dbName = process.env.DB_NAME || 'taskflow';

  try {
    await client.connect();
    console.log('\n  🐘 Connected to PostgreSQL as admin');

    // Check if the database already exists
    const { rows } = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]
    );

    if (rows.length > 0) {
      console.log(`  ✅ Database "${dbName}" already exists — skipping creation.`);
    } else {
      // Cannot use parameterized queries for CREATE DATABASE
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`  ✅ Database "${dbName}" created successfully!`);
    }

    console.log('\n  Next steps:');
    console.log('  1. Make sure .env has the correct DB_PASSWORD');
    console.log('  2. Run: npm run dev\n');

  } catch (err) {
    console.error('\n  ❌ Setup failed:', err.message);
    if (err.message.includes('password')) {
      console.error('  → Check DB_PASSWORD in your .env file\n');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

setupDatabase();
