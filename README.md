# 📋 TaskFlow — Smart Daily Planner

A full-stack productivity app to manage your **scheduled tasks** and **to-do list**, powered by **Node.js + Express** and **PostgreSQL**.

---

## ✨ Features

- 📅 **Scheduled Tasks** — Create tasks with a specific start & end time
- ✅ **To-Do List** — Manage todos with priority levels (low / medium / high)
- 🏷️ **Categories** — Organize tasks by `work`, `health`, `personal`, `study`, or `other`
- 🗄️ **PostgreSQL Backend** — Persistent data storage with auto-migrations on startup
- 🌐 **REST API** — Clean JSON API with full CRUD support
- ⚡ **Health Check Endpoint** — `/api/health` for monitoring

---

## 🛠️ Tech Stack

| Layer     | Technology            |
|-----------|-----------------------|
| Backend   | Node.js + Express 4   |
| Database  | PostgreSQL            |
| ORM/Query | `pg` (node-postgres)  |
| Frontend  | Static files (`/public`) |
| Hosting   | Render.com            |

---

## 📁 Project Structure

```
taskmanager/
├── db/
│   ├── index.js       # PostgreSQL connection pool
│   ├── migrate.js     # Schema migrations (auto-run on start)
│   └── setup.js       # One-time database creation script
├── public/            # Static frontend (HTML/CSS/JS)
├── server.js          # Express app + all API routes
├── package.json
├── .env               # Local environment variables (not committed)
├── .gitignore
└── render.yaml        # Render.com deployment config
```

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [PostgreSQL](https://www.postgresql.org/) v14+

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/taskmanager.git
cd taskmanager
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the root directory:

```env
# PostgreSQL connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=taskflow
DB_USER=postgres
DB_PASSWORD=your_password_here

# App
PORT=3000
NODE_ENV=development
```

### 4. Create the database

```bash
npm run db:setup
```

### 5. Run the app

```bash
npm run dev
```

The app will be available at **http://localhost:3000**

> ℹ️ Database migrations run **automatically** on every startup — no manual steps needed.

---

## 🔌 API Reference

### Base URL
- **Local:** `http://localhost:3000`
- **Production:** `https://your-app.onrender.com`

---

### 📅 Scheduled Tasks — `/api/scheduled`

| Method   | Endpoint                | Description               |
|----------|-------------------------|---------------------------|
| `GET`    | `/api/scheduled`        | List all scheduled tasks  |
| `GET`    | `/api/scheduled/:id`    | Get a single task         |
| `POST`   | `/api/scheduled`        | Create a new task         |
| `PATCH`  | `/api/scheduled/:id`    | Update a task             |
| `DELETE` | `/api/scheduled/:id`    | Delete a task             |

**POST/PATCH Body:**
```json
{
  "name": "Morning Run",
  "cat": "health",
  "start": "07:00",
  "end": "08:00",
  "notes": "5km jog in the park",
  "completed": false
}
```

---

### ✅ To-Do Tasks — `/api/todos`

| Method   | Endpoint          | Description            |
|----------|-------------------|------------------------|
| `GET`    | `/api/todos`      | List all todos         |
| `GET`    | `/api/todos/:id`  | Get a single todo      |
| `POST`   | `/api/todos`      | Create a new todo      |
| `PATCH`  | `/api/todos/:id`  | Update a todo          |
| `DELETE` | `/api/todos/:id`  | Delete a todo          |

**POST/PATCH Body:**
```json
{
  "name": "Buy groceries",
  "cat": "personal",
  "priority": "medium",
  "notes": "Milk, eggs, bread",
  "completed": false
}
```

---

### 🏥 Health Check — `/api/health`

```bash
GET /api/health
```

```json
{
  "success": true,
  "status": "ok",
  "uptime": "120.5s",
  "env": "production",
  "database": {
    "db_name": "taskflow",
    "scheduled_count": 5,
    "todo_count": 12,
    "server_time": "2026-10-02T15:30:00Z"
  }
}
```

---

### Valid Field Values

| Field         | Allowed Values                                     |
|---------------|----------------------------------------------------|
| `cat`         | `work`, `health`, `personal`, `study`, `other`     |
| `priority`    | `low`, `medium`, `high`                            |
| `start`/`end` | `HH:MM` (24-hour format, e.g. `09:30`)             |

---

## 🗄️ Database Schema

### `scheduled_tasks`
| Column         | Type         | Notes                         |
|----------------|--------------|-------------------------------|
| `id`           | UUID         | Primary key                   |
| `name`         | VARCHAR(255) | Required                      |
| `cat`          | VARCHAR(50)  | Category                      |
| `start_time`   | TIME         | Required (HH:MM)              |
| `end_time`     | TIME         | Required, must be after start |
| `notes`        | TEXT         | Optional                      |
| `completed`    | BOOLEAN      | Default: false                |
| `completed_at` | TIMESTAMPTZ  | Set when marked complete      |
| `created_at`   | TIMESTAMPTZ  | Auto-set                      |
| `updated_at`   | TIMESTAMPTZ  | Auto-updated via trigger      |

### `todo_tasks`
| Column         | Type         | Notes                     |
|----------------|--------------|---------------------------|
| `id`           | UUID         | Primary key               |
| `name`         | VARCHAR(255) | Required                  |
| `cat`          | VARCHAR(50)  | Category                  |
| `priority`     | VARCHAR(20)  | `low` / `medium` / `high` |
| `notes`        | TEXT         | Optional                  |
| `completed`    | BOOLEAN      | Default: false            |
| `completed_at` | TIMESTAMPTZ  | Set when marked complete  |
| `created_at`   | TIMESTAMPTZ  | Auto-set                  |
| `updated_at`   | TIMESTAMPTZ  | Auto-updated via trigger  |

---

## ☁️ Deployment (Render.com)

See [render.yaml](./render.yaml) for the full deployment configuration.

**Quick steps:**
1. Push code to GitHub
2. Go to [render.com](https://render.com) → **New** → **Blueprint**
3. Connect your GitHub repo
4. Render auto-detects `render.yaml` and sets everything up
5. Your app goes live at `https://your-app.onrender.com`

---

## 📜 License

MIT — feel free to use and modify.
