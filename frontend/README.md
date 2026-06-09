# Rebuildr — frontend

Basic React + Vite + TS scaffold that exercises the deployed Flask/Supabase backend.

## Setup

```powershell
cd frontend
copy .env.example .env
# edit .env with your Supabase URL + anon key
npm install
npm run dev
```

Open http://localhost:5173.

## Env vars

- `VITE_API_BASE` — Flask backend URL (defaults to the deployed Render URL).
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — used by `@supabase/supabase-js`
  to sign in/up directly. The resulting JWT is sent to the Flask backend as
  `Authorization: Bearer <token>`.

## Flow

1. **Landing** — "I need help now" / "Start recovery planning" CTAs.
2. **Sign in / Sign up** (Supabase Auth).
3. **Dashboard** — list of cases + create new.
4. **Case Hub** — Inventory · Documents · Recovery Plan · Emergency Contacts tiles
   (Documents/Emergency Contacts are placeholders).
5. **Inventory** — add damaged items by category/damage/severity/value.
6. **Recommendations** — runs `GET /cases/<id>/recommendations` against whatever
   data is already on the case. No questions flow — skips straight to results.
