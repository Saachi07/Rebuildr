-- Row-level security: a signed-in user can only see/modify their own rows.
-- The Supabase JWT puts the user's id in `auth.uid()`.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
    for select using (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
    for update using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- recovery_cases
-- ---------------------------------------------------------------------------
alter table public.recovery_cases enable row level security;

drop policy if exists "cases: read own" on public.recovery_cases;
create policy "cases: read own" on public.recovery_cases
    for select using (auth.uid() = user_id);

drop policy if exists "cases: insert own" on public.recovery_cases;
create policy "cases: insert own" on public.recovery_cases
    for insert with check (auth.uid() = user_id);

drop policy if exists "cases: update own" on public.recovery_cases;
create policy "cases: update own" on public.recovery_cases
    for update using (auth.uid() = user_id);

drop policy if exists "cases: delete own" on public.recovery_cases;
create policy "cases: delete own" on public.recovery_cases
    for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- case_items, owned via parent case
-- ---------------------------------------------------------------------------
alter table public.case_items enable row level security;

drop policy if exists "items: read via case" on public.case_items;
create policy "items: read via case" on public.case_items
    for select using (
        exists (
            select 1 from public.recovery_cases c
            where c.id = case_items.case_id and c.user_id = auth.uid()
        )
    );

drop policy if exists "items: write via case" on public.case_items;
create policy "items: write via case" on public.case_items
    for all using (
        exists (
            select 1 from public.recovery_cases c
            where c.id = case_items.case_id and c.user_id = auth.uid()
        )
    ) with check (
        exists (
            select 1 from public.recovery_cases c
            where c.id = case_items.case_id and c.user_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------------
-- recommendations, owned via parent case
-- ---------------------------------------------------------------------------
alter table public.recommendations enable row level security;

drop policy if exists "recs: read via case" on public.recommendations;
create policy "recs: read via case" on public.recommendations
    for select using (
        exists (
            select 1 from public.recovery_cases c
            where c.id = recommendations.case_id and c.user_id = auth.uid()
        )
    );

drop policy if exists "recs: write via case" on public.recommendations;
create policy "recs: write via case" on public.recommendations
    for all using (
        exists (
            select 1 from public.recovery_cases c
            where c.id = recommendations.case_id and c.user_id = auth.uid()
        )
    ) with check (
        exists (
            select 1 from public.recovery_cases c
            where c.id = recommendations.case_id and c.user_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------------
-- document_summaries, owned via parent case
-- ---------------------------------------------------------------------------
alter table public.document_summaries enable row level security;

drop policy if exists "docs: read via case" on public.document_summaries;
create policy "docs: read via case" on public.document_summaries
    for select using (
        exists (
            select 1 from public.recovery_cases c
            where c.id = document_summaries.case_id and c.user_id = auth.uid()
        )
    );

drop policy if exists "docs: write via case" on public.document_summaries;
create policy "docs: write via case" on public.document_summaries
    for all using (
        exists (
            select 1 from public.recovery_cases c
            where c.id = document_summaries.case_id and c.user_id = auth.uid()
        )
    ) with check (
        exists (
            select 1 from public.recovery_cases c
            where c.id = document_summaries.case_id and c.user_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------------
-- resources, public read; writes restricted to service_role (no policy = denied)
-- ---------------------------------------------------------------------------
alter table public.resources enable row level security;

drop policy if exists "resources: read all" on public.resources;
create policy "resources: read all" on public.resources
    for select using (true);
