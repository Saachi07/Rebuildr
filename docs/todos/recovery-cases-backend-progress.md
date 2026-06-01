# Recovery Cases Backend — Implementation Progress

Branch: `worktree-feature+recovery-cases-backend`
Plan: `docs/superpowers/plans/2026-06-01-recovery-cases-backend.md`
Last updated: 2026-06-01

---

## Status

| Task | Status | Commit(s) |
|---|---|---|
| Task 1: Project scaffold and dependencies | ✅ Done | 28474b0, 49bf255, 604e1ac |
| Task 2: Database schema | ✅ Done | d7f67fc |
| Task 3: App factory, config, and database client | ✅ Done | c5be641, 9ce6a85, 359dcad |
| Task 4: Error helpers and custom exceptions | ✅ Done | e024917, 7201b56 |
| Task 5: Repository layer | 🔲 Not started | — |
| Task 6: conftest.py — app fixture and fake repository | 🔲 Not started | — |
| Task 7: Service layer | 🔲 Not started | — |
| Task 8: Routes blueprint | 🔲 Not started | — |
| Task 9: Full test suite | 🔲 Not started | — |
| Task 10: Smoke-test the running server | 🔲 Not started | — |

---

## What Was Built

### Task 1 — Scaffold
- `Rebuildr-backend/requirements.txt` — pinned deps (Flask 3.1.0, supabase 2.10.0, pytest 8.3.4, etc.)
- `Rebuildr-backend/.env.example` — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS`
- `Rebuildr-backend/wsgi.py` — WSGI entrypoint
- `.gitignore` — venv, pyc, .env, .DS_Store ignored
- Venv at `Rebuildr-backend/venv/` using Python 3.12, all deps installed

### Task 2 — Schema
- `Rebuildr-backend/schema/recovery_cases.sql` — full table definition with check constraints, `disaster_type_other_required` constraint, `updated_at` trigger, and soft-delete `archived_at` field
- **Not yet run in Supabase** — requires manual execution in the SQL Editor

### Task 3 — App factory
- `Rebuildr-backend/app/__init__.py` — `create_app()` with CORS, blueprint registration, `CaseError` handler, `HTTPException` handler, fallback `INTERNAL_ERROR` handler; skips `init_db()` when `TESTING=True`
- `Rebuildr-backend/app/config.py` — `Config` and `TestingConfig` classes
- `Rebuildr-backend/app/db.py` — supabase-py singleton with `init_db()` / `get_db()`
- `Rebuildr-backend/app/routes/cases.py` — minimal stub (`Blueprint` only, no routes yet)
- Empty `__init__.py` files for routes, services, repositories packages

### Task 4 — Error helpers
- `Rebuildr-backend/app/errors.py` — `CaseError(Exception)` with `to_response()`; `case_error()` delegates to it (single envelope definition)
- `Rebuildr-backend/tests/__init__.py` — empty
- `Rebuildr-backend/tests/test_cases.py` — 4 tests, all passing

---

## Test State

```
4 passed, 1 warning
```

Tests cover: error envelope shape, empty details default, `CaseError` attributes, `to_response()` / `case_error()` consistency.

---

## Key Design Decisions Made

- **ID contract:** DB stores `id` as UUID; API exposes `case_id = "case_" + str(id)`. Assembled only in `_format_case()` in the repository layer.
- **Supabase client:** Module-level singleton in `db.py`. Skipped entirely in tests via `TESTING=True` guard + fake repository injection.
- **Error handling:** `CaseError` is registered as an app-level `@errorhandler` — routes raise it, the factory catches it. No per-route try/except needed.
- **`maybe_single()`** (not `.single()`) for single-row reads — avoids `APIError` on zero rows.
- **Archived cases** filtered with `.neq("case_status", "archived")` on every read/write.
- **`archived_at`** set in Python as `datetime.now(timezone.utc).isoformat()` — not a SQL string.

---

## What Comes Next

- **Task 5:** `app/repositories/cases_repository.py` — 5 methods wrapping supabase-py, `_format_case()` helper
- **Task 6:** `tests/conftest.py` — `FakeCasesRepository` in-memory implementation + `client` fixture
- **Task 7:** `app/services/cases_service.py` — validation, business rules, calls repository
- **Task 8:** `app/routes/cases.py` — replace stub with 5 real routes
- **Task 9:** Full 18-test suite
- **Task 10:** Live server smoke test (requires `.env` with real Supabase credentials)

---

## Notes

- `schema/recovery_cases.sql` must be run manually in the Supabase SQL Editor before Task 10.
- The `supabase-py` library emits a `DeprecationWarning` about the `gotrue` package — harmless, not actionable until supabase-py releases a fix.
- Resume execution with: `superpowers:subagent-driven-development`, starting at Task 5.
