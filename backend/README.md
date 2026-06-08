# Rebuildr backend

Flask + Supabase. Persistence is in Supabase Postgres; auth is Supabase Auth;
recommendations come from a content-based filter over a curated resource
catalog.

## Layout

```
backend/
├── app/
│   ├── __init__.py            create_app, blueprint registration, CORS
│   ├── config.py              env-var → config
│   ├── extensions.py          Supabase client factories (anon / service / user)
│   ├── auth.py                JWT bearer-token verification decorator
│   ├── blueprints/
│   │   ├── health.py          GET  /health
│   │   ├── auth.py            POST /auth/{signup,login,logout,refresh},  GET/PATCH /auth/me
│   │   ├── cases.py           CRUD /cases
│   │   ├── items.py           CRUD /cases/<id>/items
│   │   └── recommendations.py GET/POST /cases/<id>/recommendations,  PATCH /recommendations/<id>
│   └── services/
│       ├── tags.py            intake answers → semantic tags
│       └── content_filter.py  content-based recommender (TF-IDF + structured boosts)
├── supabase/migrations/
│   ├── 0001_init.sql          tables + triggers
│   ├── 0002_rls.sql           row-level security policies
│   └── 0003_seed_resources.sql initial resource catalog
├── requirements.txt
├── .env.example
└── run.py
```

## Setup

1. **Create a Supabase project** at <https://supabase.com>. From
   *Project Settings → API* copy:
   - Project URL → `SUPABASE_URL`
   - `anon` key → `SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
   - JWT Secret → `SUPABASE_JWT_SECRET`

2. **Apply migrations.** Either paste each file in `supabase/migrations/`
   into the Supabase SQL editor in order, or use the Supabase CLI:

   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```

3. **Install Python deps:**

   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\activate            # Windows
   pip install -r requirements.txt
   ```

4. **Copy env and run:**

   ```bash
   cp .env.example .env              # fill in the Supabase values
   python run.py
   ```

   The API serves on `http://127.0.0.1:5000`.

## Auth flow

All non-`/auth/*` and non-`/health` endpoints require a Bearer token. Get
one with `POST /auth/login`; send it as `Authorization: Bearer <token>`.

```
POST /auth/signup    { email, password, full_name? }
POST /auth/login     { email, password }            → { user, session }
POST /auth/refresh   { refresh_token }              → { session }
POST /auth/logout
GET  /auth/me                                       → { id, email, profile }
PATCH /auth/me       { full_name?, region?, language? }
```

A trigger on `auth.users` auto-creates the `profiles` row on signup.

## Cases and items

```
GET    /cases
POST   /cases                   { case_name, disaster_type, region?, location?,
                                   incident_date?, insurance_provider?,
                                   insurance_policy_number?, intake_answers? }
GET    /cases/<id>
PATCH  /cases/<id>
DELETE /cases/<id>              soft-delete (sets deleted_at)

GET    /cases/<id>/items
POST   /cases/<id>/items        { name, category?, material?, estimated_value?,
                                   damage_type?, damage_severity?, confidence?,
                                   image_url?, description? }
PATCH  /cases/<id>/items/<item_id>
DELETE /cases/<id>/items/<item_id>
```

Updating `intake_answers` recomputes the case's `derived_tags`, which the
recommender uses to filter and score resources.

## Recommendations — content-based filtering

```
GET   /cases/<id>/recommendations?top_k=5    run filter, return groups
POST  /cases/<id>/recommendations  { top_k? } run filter, persist into recommendations
PATCH /recommendations/<id>  { status }      suggested | saved | dismissed | done
```

The engine in `app/services/content_filter.py`:

1. **Eligibility filter** drops resources by `region`, `disaster_types`,
   `requires` / `excludes` tags, and `eligibility_days` window.
2. **TF-IDF cosine similarity** between a query (case attributes + item
   categories + derived tags) and each resource's `search_text`.
3. **Structured boosts** on top of cosine: insurer match, tag-overlap
   depth, freshness, urgency for shelter/health when the disaster is recent.
4. **Per-category top-K** so the UI gets a diverse mix of suggestion types.

Every recommendation carries a `reasons` list for "Suggested because: …"
copy in the UI.

## Adding scraped resources

The scraper should `INSERT … ON CONFLICT DO UPDATE` into `public.resources`
with the service-role key, using the same shape as the seed file. The
`search_text` column is a stored generated column — populate the source
fields, and the filter picks it up automatically.

## Where the other branches plug in

This backend exposes the storage / auth / recommendation layer. Other
branches contribute pipelines that feed it:

- **`gemini-image-model`** — image analysis. Posts results to
  `POST /cases/<id>/items` with `category`, `damage_type`, `damage_severity`,
  `confidence`, `image_url`.
- **`questions`** — adaptive intake. Stores answers on the case via
  `PATCH /cases/<id>` with `intake_answers`. Derived tags update
  automatically.
- **`pdf-and-summary`** — document intelligence. Writes outputs to
  `public.document_summaries` (table already exists). A REST endpoint can
  be added when the pipeline is wired in.
