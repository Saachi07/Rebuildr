-- Round 3 schema changes.
--
-- 1. Decouple case_items from cases, they become a per-user library that
--    can optionally be linked to a case. (#13)
-- 2. Add a `room` column on items so users can group by room. (#18)
-- 3. Add a `location` field on profiles so users can store their city
--    independent of any single case. (#15)

-- ---------------------------------------------------------------------------
-- case_items: per-user library
-- ---------------------------------------------------------------------------
alter table public.case_items
    add column if not exists user_id uuid references auth.users(id) on delete cascade,
    add column if not exists room    text;

-- Backfill user_id from the parent case for existing rows.
update public.case_items ci
   set user_id = rc.user_id
  from public.recovery_cases rc
 where ci.case_id = rc.id
   and ci.user_id is null;

-- case_id can now be null, items can live in the user's library without
-- belonging to a specific case.
alter table public.case_items
    alter column case_id drop not null;

-- New RLS: a user can access their own items (via user_id) OR items that
-- belong to one of their cases (legacy path). The old "items: write via
-- case" / "items: read via case" policies are replaced.
drop policy if exists "items: read via case" on public.case_items;
drop policy if exists "items: write via case" on public.case_items;

create policy "items: read own" on public.case_items
    for select using (
        case_items.user_id = auth.uid()
        or exists (
            select 1 from public.recovery_cases c
             where c.id = case_items.case_id and c.user_id = auth.uid()
        )
    );

create policy "items: insert own" on public.case_items
    for insert with check (
        -- Either we're claiming ownership ourselves, or attaching to a
        -- case we own (or both).
        (case_items.user_id = auth.uid())
        or exists (
            select 1 from public.recovery_cases c
             where c.id = case_items.case_id and c.user_id = auth.uid()
        )
    );

create policy "items: update own" on public.case_items
    for update using (
        case_items.user_id = auth.uid()
        or exists (
            select 1 from public.recovery_cases c
             where c.id = case_items.case_id and c.user_id = auth.uid()
        )
    );

create policy "items: delete own" on public.case_items
    for delete using (
        case_items.user_id = auth.uid()
        or exists (
            select 1 from public.recovery_cases c
             where c.id = case_items.case_id and c.user_id = auth.uid()
        )
    );

create index if not exists case_items_user_idx on public.case_items(user_id);

-- ---------------------------------------------------------------------------
-- profiles: free-text location field (region stays as a province code)
-- ---------------------------------------------------------------------------
alter table public.profiles
    add column if not exists location text;
