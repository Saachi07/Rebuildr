-- Claim-management features.
--
-- 1. case_communications: a log of every call, email, and meeting with the
--    insurer or anyone else involved in a claim. Exists because a survivor's
--    insurer changed its story about her coverage and she had no record to
--    push back with.
-- 2. ale_expenses: additional living expenses (hotel, meals, transport)
--    while the home is uninhabitable, with receipts.
-- 3. recovery_cases: claim-stage tracking, checklist state, coverage
--    decisions, and an explicit closed_at timestamp.
-- 4. profiles: when the user last reviewed their policy (feeds readiness).

-- ---------------------------------------------------------------------------
-- case_communications
-- ---------------------------------------------------------------------------
create table if not exists public.case_communications (
    id                 uuid primary key default gen_random_uuid(),
    user_id            uuid not null references auth.users(id) on delete cascade,
    case_id            uuid not null references public.recovery_cases(id) on delete cascade,
    occurred_at        timestamptz not null default now(),
    contact_name       text,
    organization       text,
    channel            text,                 -- phone, email, in_person, mail, other
    kind               text not null default 'note',  -- note, call, email, meeting, discrepancy
    summary            text not null,
    insurer_statement  text,                 -- what the insurer said, verbatim where possible
    follow_up          text,
    created_at         timestamptz not null default now(),
    deleted_at         timestamptz
);

create index if not exists case_communications_user_idx on public.case_communications(user_id);
create index if not exists case_communications_case_idx on public.case_communications(case_id);

alter table public.case_communications enable row level security;

drop policy if exists "communications: read own" on public.case_communications;
create policy "communications: read own" on public.case_communications
    for select using (auth.uid() = user_id);

drop policy if exists "communications: insert own" on public.case_communications;
create policy "communications: insert own" on public.case_communications
    for insert with check (auth.uid() = user_id);

drop policy if exists "communications: update own" on public.case_communications;
create policy "communications: update own" on public.case_communications
    for update using (auth.uid() = user_id);

drop policy if exists "communications: delete own" on public.case_communications;
create policy "communications: delete own" on public.case_communications
    for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- ale_expenses
-- ---------------------------------------------------------------------------
create table if not exists public.ale_expenses (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users(id) on delete cascade,
    case_id       uuid not null references public.recovery_cases(id) on delete cascade,
    category      text not null,             -- hotel, meals, transport, storage, pets, other
    vendor        text,
    amount        numeric not null,
    expense_date  date,
    receipt_url   text,
    notes         text,
    created_at    timestamptz not null default now(),
    deleted_at    timestamptz
);

create index if not exists ale_expenses_user_idx on public.ale_expenses(user_id);
create index if not exists ale_expenses_case_idx on public.ale_expenses(case_id);

alter table public.ale_expenses enable row level security;

drop policy if exists "ale: read own" on public.ale_expenses;
create policy "ale: read own" on public.ale_expenses
    for select using (auth.uid() = user_id);

drop policy if exists "ale: insert own" on public.ale_expenses;
create policy "ale: insert own" on public.ale_expenses
    for insert with check (auth.uid() = user_id);

drop policy if exists "ale: update own" on public.ale_expenses;
create policy "ale: update own" on public.ale_expenses
    for update using (auth.uid() = user_id);

drop policy if exists "ale: delete own" on public.ale_expenses;
create policy "ale: delete own" on public.ale_expenses
    for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- recovery_cases: claim tracking columns
-- ---------------------------------------------------------------------------
alter table public.recovery_cases
    add column if not exists claim_stage         text,
    add column if not exists checklist_state     jsonb,
    add column if not exists coverage_decisions  jsonb,
    add column if not exists closed_at           timestamptz;

-- ---------------------------------------------------------------------------
-- profiles: policy review tracking
-- ---------------------------------------------------------------------------
alter table public.profiles
    add column if not exists policy_reviewed_at  timestamptz;
