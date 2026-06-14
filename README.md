# Rebuildr
AI4Good Lab Project

## Backend, local setup

Requirements: Python 3.11+ (verified on 3.14). All commands assume PowerShell from the repo root.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env   # then edit .env
```

### Database modes

- **Supabase / Postgres**, set `DATABASE_URL` in `.env` to the Postgres URI from
  Supabase (Project Settings → Database → Connection string → URI). The app
  rewrites `postgres://` to `postgresql+psycopg://` automatically.
- **SQLite fallback**, leave `DATABASE_URL` empty. The app writes to
  `backend/instance/rebuildr.db`. Use this if Supabase migrations are flaky
  (see `roadmap.md` → Alternatives).

### Run migrations and the dev server

```powershell
$env:FLASK_APP = "run.py"
flask db upgrade            # apply existing migrations
python run.py               # serves on http://127.0.0.1:5000
```

When the schema changes, generate a new revision:

```powershell
flask db migrate -m "describe the change"
flask db upgrade
```

### Health check

```
GET http://127.0.0.1:5000/health
→ 200 {"status": "ok", "db": "ok", "db_dialect": "postgresql"}
→ 503 {"status": "degraded", "db": "error", "db_error": "OperationalError", ...}
```

Use this to confirm the DB connection is alive before debugging anything else.
