-- Rebuildr initial schema.
-- Run this in Supabase SQL editor, or via `supabase db push` if you use the CLI.
--
-- Auth is delegated to Supabase's built-in `auth.users` table. Every domain
-- table that belongs to a user references `auth.users(id)` directly and is
-- protected with row-level security so users can only see their own rows.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles, extends auth.users with app-specific fields
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
    id           uuid primary key references auth.users(id) on delete cascade,
    full_name    text,
    region       text,                              -- province code, e.g. 'AB'
    language     text not null default 'en',
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

-- Auto-create a profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, full_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- recovery_cases, one per disaster event a user is recovering from
-- ---------------------------------------------------------------------------
create table if not exists public.recovery_cases (
    id                       uuid primary key default gen_random_uuid(),
    user_id                  uuid not null references auth.users(id) on delete cascade,
    case_name                text not null,
    disaster_type            text not null,        -- wildfire, flood, tornado, ...
    region                   text,                 -- province code
    location                 text,
    incident_date            date,
    insurance_provider       text,
    insurance_policy_number  text,
    status                   text not null default 'draft',
    intake_answers           jsonb not null default '{}'::jsonb,
    derived_tags             text[] not null default '{}',
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now(),
    deleted_at               timestamptz
);

create index if not exists recovery_cases_user_idx on public.recovery_cases(user_id);
create index if not exists recovery_cases_status_idx on public.recovery_cases(status);

-- ---------------------------------------------------------------------------
-- case_items, damaged items in a recovery case (manual + ML-detected)
-- ---------------------------------------------------------------------------
create table if not exists public.case_items (
    id               uuid primary key default gen_random_uuid(),
    case_id          uuid not null references public.recovery_cases(id) on delete cascade,
    name             text not null,
    category         text,                          -- furniture, electronics, clothing, document, ...
    material         text,
    estimated_value  numeric(12, 2),
    damage_type      text,                          -- burnt, water, smoke, structural
    damage_severity  text,                          -- intact, salvageable, destroyed
    confidence       numeric(4, 3),                 -- ML confidence in [0, 1]
    image_url        text,
    description      text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists case_items_case_idx on public.case_items(case_id);

-- ---------------------------------------------------------------------------
-- resources, recommender catalog (gov programs, shelters, etc.)
-- Shared across users; not row-protected.
-- ---------------------------------------------------------------------------
create table if not exists public.resources (
    id                   text primary key,
    type                 text not null,            -- policy, shelter, health, financial, community, documents
    title                text not null,
    body                 text not null,
    url                  text,
    phone                text,
    region               text not null default '*',
    disaster_types       text[] not null default '{*}',
    supports_plans       int[] not null default '{}',
    requires             text[] not null default '{}',
    excludes             text[] not null default '{}',
    insurance_companies  text[],
    eligibility_days     int,
    scraped_at           date,
    -- search_text is maintained by a trigger below. Can't be a generated
    -- column because array_to_string() is STABLE, not IMMUTABLE, and
    -- generated columns require an immutable expression.
    search_text          text,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

create index if not exists resources_type_idx on public.resources(type);
create index if not exists resources_region_idx on public.resources(region);

create or replace function public.resources_set_search_text()
returns trigger language plpgsql as $$
begin
    new.search_text :=
        coalesce(new.title, '') || ' ' ||
        coalesce(new.body, '') || ' ' ||
        coalesce(new.type, '') || ' ' ||
        coalesce(array_to_string(new.disaster_types, ' '), '') || ' ' ||
        coalesce(array_to_string(new.requires, ' '), '');
    return new;
end;
$$;

drop trigger if exists resources_set_search_text on public.resources;
create trigger resources_set_search_text
    before insert or update on public.resources
    for each row execute function public.resources_set_search_text();

-- ---------------------------------------------------------------------------
-- recommendations, per-case ranked output of the content-based filter
-- ---------------------------------------------------------------------------
create table if not exists public.recommendations (
    id            uuid primary key default gen_random_uuid(),
    case_id       uuid not null references public.recovery_cases(id) on delete cascade,
    resource_id   text not null references public.resources(id) on delete cascade,
    score         numeric(8, 4) not null,
    reasons       text[] not null default '{}',
    rank          int not null,
    status        text not null default 'suggested',   -- suggested, saved, dismissed, done
    generated_at  timestamptz not null default now(),
    unique (case_id, resource_id)
);

create index if not exists recommendations_case_idx on public.recommendations(case_id);

-- ---------------------------------------------------------------------------
-- document_summaries, output of the PDF/summary pipeline
-- ---------------------------------------------------------------------------
create table if not exists public.document_summaries (
    id          uuid primary key default gen_random_uuid(),
    case_id     uuid not null references public.recovery_cases(id) on delete cascade,
    file_name   text not null,
    summary     text,
    issues      jsonb not null default '[]'::jsonb,
    deadlines   jsonb not null default '[]'::jsonb,
    actions     jsonb not null default '[]'::jsonb,
    created_at  timestamptz not null default now()
);

create index if not exists document_summaries_case_idx on public.document_summaries(case_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger (shared)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
    for each row execute function public.set_updated_at();

drop trigger if exists recovery_cases_set_updated_at on public.recovery_cases;
create trigger recovery_cases_set_updated_at before update on public.recovery_cases
    for each row execute function public.set_updated_at();

drop trigger if exists case_items_set_updated_at on public.case_items;
create trigger case_items_set_updated_at before update on public.case_items
    for each row execute function public.set_updated_at();

drop trigger if exists resources_set_updated_at on public.resources;
create trigger resources_set_updated_at before update on public.resources
    for each row execute function public.set_updated_at();
