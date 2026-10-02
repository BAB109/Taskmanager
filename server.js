/**
 * TaskFlow — server.js
 * Express backend with PostgreSQL database.
 * Data is persisted to a Postgres DB (see db/migrate.js for schema).
 */

'use strict';

require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const db       = require('./db/index');
const { runMigrations } = require('./db/migrate');

// ─── Config ────────────────────────────────────────────────────
const PORT        = process.env.PORT        || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || `http://localhost:${PORT}`;

// ─── App Setup ────────────────────────────────────────────────
const app = express();

app.use(cors({ origin: CORS_ORIGIN, methods: ['GET', 'POST', 'PATCH', 'DELETE'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend from /public
app.use(express.static(path.join(__dirname, 'public')));

// ─── Validation Helpers ───────────────────────────────────────
const VALID_CATEGORIES = ['work', 'health', 'personal', 'study', 'other'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];
const TIME_RE          = /^\d{2}:\d{2}$/;

const isValidTime     = t => typeof t === 'string' && TIME_RE.test(t);
const isValidCategory = c => VALID_CATEGORIES.includes(c);
const isValidPriority = p => VALID_PRIORITIES.includes(p);

// ─── Response Helpers ────────────────────────────────────────
const sendError = (res, status, message) =>
  res.status(status).json({ success: false, error: message });

/** Map a Postgres row → clean API object for scheduled tasks */
function mapScheduled(row) {
  return {
    id:          row.id,
    name:        row.name,
    cat:         row.cat,
    start:       row.start_time.slice(0, 5),   // "HH:MM"
    end:         row.end_time.slice(0, 5),
    notes:       row.notes || '',
    completed:   row.completed,
    completedAt: row.completed_at || null,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

/** Map a Postgres row → clean API object for todo tasks */
function mapTodo(row) {
  return {
    id:          row.id,
    name:        row.name,
    cat:         row.cat,
    priority:    row.priority,
    notes:       row.notes || '',
    completed:   row.completed,
    completedAt: row.completed_at || null,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

// ══════════════════════════════════════════════════════════════
//  SCHEDULED TASKS API
// ══════════════════════════════════════════════════════════════

// GET /api/scheduled — List all scheduled tasks (sorted by start time)
app.get('/api/scheduled', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM scheduled_tasks ORDER BY start_time ASC'
    );
    res.json({ success: true, data: rows.map(mapScheduled) });
  } catch (err) {
    sendError(res, 500, 'Failed to fetch scheduled tasks.');
  }
});

// GET /api/scheduled/:id — Get a single scheduled task
app.get('/api/scheduled/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM scheduled_tasks WHERE id = $1', [req.params.id]
    );
    if (!rows.length) return sendError(res, 404, 'Scheduled task not found.');
    res.json({ success: true, data: mapScheduled(rows[0]) });
  } catch (err) {
    sendError(res, 500, 'Failed to fetch task.');
  }
});

// POST /api/scheduled — Create a new scheduled task
app.post('/api/scheduled', async (req, res) => {
  const { name, cat = 'other', start, end, notes = '' } = req.body;

  if (!name || typeof name !== 'string' || !name.trim())
    return sendError(res, 400, 'Task name is required.');
  if (!isValidTime(start))
    return sendError(res, 400, 'Invalid start time. Use HH:MM format.');
  if (!isValidTime(end))
    return sendError(res, 400, 'Invalid end time. Use HH:MM format.');
  if (start >= end)
    return sendError(res, 400, 'End time must be after start time.');
  if (!isValidCategory(cat))
    return sendError(res, 400, `Invalid category. Use: ${VALID_CATEGORIES.join(', ')}.`);

  try {
    const { rows } = await db.query(
      `INSERT INTO scheduled_tasks (name, cat, start_time, end_time, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name.trim(), cat, start, end, notes.trim()]
    );
    res.status(201).json({ success: true, data: mapScheduled(rows[0]) });
  } catch (err) {
    sendError(res, 500, 'Failed to create task.');
  }
});

// PATCH /api/scheduled/:id — Update a scheduled task
app.patch('/api/scheduled/:id', async (req, res) => {
  const { id } = req.params;

  // Fetch current row first
  let current;
  try {
    const { rows } = await db.query('SELECT * FROM scheduled_tasks WHERE id = $1', [id]);
    if (!rows.length) return sendError(res, 404, 'Scheduled task not found.');
    current = rows[0];
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch task.');
  }

  // Merge incoming fields onto current values
  const name      = 'name'      in req.body ? String(req.body.name).trim() : current.name;
  const cat       = 'cat'       in req.body ? req.body.cat                 : current.cat;
  const start     = 'start'     in req.body ? req.body.start               : current.start_time.slice(0, 5);
  const end       = 'end'       in req.body ? req.body.end                 : current.end_time.slice(0, 5);
  const notes     = 'notes'     in req.body ? String(req.body.notes).trim(): current.notes;
  const completed = 'completed' in req.body ? Boolean(req.body.completed)  : current.completed;

  // Validate merged values
  if (!name)                    return sendError(res, 400, 'Task name cannot be empty.');
  if (!isValidTime(start))      return sendError(res, 400, 'Invalid start time.');
  if (!isValidTime(end))        return sendError(res, 400, 'Invalid end time.');
  if (start >= end)             return sendError(res, 400, 'End time must be after start time.');
  if (!isValidCategory(cat))    return sendError(res, 400, 'Invalid category.');

  const completedAt = completed && !current.completed ? 'NOW()' : null;

  try {
    const { rows } = await db.query(
      `UPDATE scheduled_tasks
       SET name        = $1,
           cat         = $2,
           start_time  = $3,
           end_time    = $4,
           notes       = $5,
           completed   = $6,
           completed_at = CASE WHEN $6 AND NOT completed THEN NOW()
                               WHEN NOT $6 THEN NULL
                               ELSE completed_at END
       WHERE id = $7
       RETURNING *`,
      [name, cat, start, end, notes, completed, id]
    );
    res.json({ success: true, data: mapScheduled(rows[0]) });
  } catch (err) {
    sendError(res, 500, 'Failed to update task.');
  }
});

// DELETE /api/scheduled/:id — Delete a scheduled task
app.delete('/api/scheduled/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM scheduled_tasks WHERE id = $1', [req.params.id]
    );
    if (!rowCount) return sendError(res, 404, 'Scheduled task not found.');
    res.json({ success: true, message: 'Scheduled task deleted.' });
  } catch (err) {
    sendError(res, 500, 'Failed to delete task.');
  }
});

// ══════════════════════════════════════════════════════════════
//  TODO TASKS API
// ══════════════════════════════════════════════════════════════

// GET /api/todos — List all todos (pending first, then by priority, then created)
app.get('/api/todos', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT * FROM todo_tasks
      ORDER BY
        completed ASC,
        CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END ASC,
        created_at DESC
    `);
    res.json({ success: true, data: rows.map(mapTodo) });
  } catch (err) {
    sendError(res, 500, 'Failed to fetch todos.');
  }
});

// GET /api/todos/:id — Get a single todo
app.get('/api/todos/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM todo_tasks WHERE id = $1', [req.params.id]
    );
    if (!rows.length) return sendError(res, 404, 'Todo task not found.');
    res.json({ success: true, data: mapTodo(rows[0]) });
  } catch (err) {
    sendError(res, 500, 'Failed to fetch todo.');
  }
});

// POST /api/todos — Create a new todo
app.post('/api/todos', async (req, res) => {
  const { name, cat = 'other', priority = 'medium', notes = '' } = req.body;

  if (!name || typeof name !== 'string' || !name.trim())
    return sendError(res, 400, 'Task name is required.');
  if (!isValidCategory(cat))
    return sendError(res, 400, `Invalid category. Use: ${VALID_CATEGORIES.join(', ')}.`);
  if (!isValidPriority(priority))
    return sendError(res, 400, `Invalid priority. Use: ${VALID_PRIORITIES.join(', ')}.`);

  try {
    const { rows } = await db.query(
      `INSERT INTO todo_tasks (name, cat, priority, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), cat, priority, notes.trim()]
    );
    res.status(201).json({ success: true, data: mapTodo(rows[0]) });
  } catch (err) {
    sendError(res, 500, 'Failed to create todo.');
  }
});

// PATCH /api/todos/:id — Update a todo
app.patch('/api/todos/:id', async (req, res) => {
  const { id } = req.params;

  let current;
  try {
    const { rows } = await db.query('SELECT * FROM todo_tasks WHERE id = $1', [id]);
    if (!rows.length) return sendError(res, 404, 'Todo task not found.');
    current = rows[0];
  } catch (err) {
    return sendError(res, 500, 'Failed to fetch todo.');
  }

  const name      = 'name'      in req.body ? String(req.body.name).trim()  : current.name;
  const cat       = 'cat'       in req.body ? req.body.cat                  : current.cat;
  const priority  = 'priority'  in req.body ? req.body.priority             : current.priority;
  const notes     = 'notes'     in req.body ? String(req.body.notes).trim() : current.notes;
  const completed = 'completed' in req.body ? Boolean(req.body.completed)   : current.completed;

  if (!name)                    return sendError(res, 400, 'Task name cannot be empty.');
  if (!isValidCategory(cat))    return sendError(res, 400, 'Invalid category.');
  if (!isValidPriority(priority)) return sendError(res, 400, 'Invalid priority.');

  try {
    const { rows } = await db.query(
      `UPDATE todo_tasks
       SET name         = $1,
           cat          = $2,
           priority     = $3,
           notes        = $4,
           completed    = $5,
           completed_at = CASE WHEN $5 AND NOT completed THEN NOW()
                               WHEN NOT $5 THEN NULL
                               ELSE completed_at END
       WHERE id = $6
       RETURNING *`,
      [name, cat, priority, notes, completed, id]
    );
    res.json({ success: true, data: mapTodo(rows[0]) });
  } catch (err) {
    sendError(res, 500, 'Failed to update todo.');
  }
});

// DELETE /api/todos/:id — Delete a todo
app.delete('/api/todos/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM todo_tasks WHERE id = $1', [req.params.id]
    );
    if (!rowCount) return sendError(res, 404, 'Todo task not found.');
    res.json({ success: true, message: 'Todo deleted.' });
  } catch (err) {
    sendError(res, 500, 'Failed to delete todo.');
  }
});

// ─── Health Check ─────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        current_database()                         AS db_name,
        (SELECT COUNT(*) FROM scheduled_tasks)::int AS scheduled_count,
        (SELECT COUNT(*) FROM todo_tasks)::int       AS todo_count,
        NOW()                                       AS server_time
    `);
    res.json({
      success:   true,
      status:    'ok',
      uptime:    process.uptime().toFixed(1) + 's',
      env:       process.env.NODE_ENV || 'development',
      database:  rows[0],
    });
  } catch (err) {
    res.status(503).json({ success: false, status: 'db_error', error: err.message });
  }
});

// ─── SPA Fallback ─────────────────────────────────────────────
app.use((req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    sendError(res, 404, `Route ${req.method} ${req.path} not found.`);
  }
});

// ─── Global Error Handler ─────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('[Server Error]', err.message);
  sendError(res, 500, 'Internal server error.');
});

// ─── Startup ─────────────────────────────────────────────────
async function start() {
  try {
    console.log('');
    console.log('  ⚡ TaskFlow — Starting up...');
    console.log('  ─────────────────────────────────────');

    // 1. Test DB connection
    await db.testConnection();

    // 2. Run migrations (idempotent — safe to always run)
    await runMigrations();

    // 3. Start HTTP server
    app.listen(PORT, () => {
      console.log('');
      console.log(`  🌐 URL  : http://localhost:${PORT}`);
      console.log(`  🔧 Mode : ${process.env.NODE_ENV || 'development'}`);
      console.log('  ─────────────────────────────────────');
      console.log('  Ready! Press Ctrl+C to stop.\n');
    });
  } catch (err) {
    console.error('\n  ❌ Startup failed:', err.message);
    console.error('  Make sure PostgreSQL is running and .env credentials are correct.\n');
    process.exit(1);
  }
}

start();

module.exports = app;
