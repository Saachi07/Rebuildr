-- Documents library + case attachments.
--
-- user_documents are uploaded once by a user and live in their personal
-- library. case_documents is a many-to-many join so a single document
-- (e.g. an insurance policy PDF) can be attached to multiple recovery
-- cases without re-uploading.

-- ---------------------------------------------------------------------------
-- user_documents — files uploaded by a user, reusable across cases
-- ---------------------------------------------------------------------------
create table if not exists public.user_documents (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users(id) on delete cascade,
    name          text not null,
    doc_type      text,                       -- insurance_policy, claim, id, deed, receipt, other
    mime_type     text not null default 'application/pdf',
    size_bytes    bigint,
    storage_path  text not null,              -- path inside the 'documents' storage bucket
    uploaded_at   timestamptz not null default now(),
    deleted_at    timestamptz
);

create index if not exists user_documents_user_idx on public.user_documents(user_id);

-- ---------------------------------------------------------------------------
-- case_documents — many-to-many join between cases and user_documents
-- ---------------------------------------------------------------------------
create table if not exists public.case_documents (
    case_id      uuid not null references public.recovery_cases(id) on delete cascade,
    document_id  uuid not null references public.user_documents(id) on delete cascade,
    attached_at  timestamptz not null default now(),
    primary key (case_id, document_id)
);

create index if not exists case_documents_doc_idx on public.case_documents(document_id);

-- ---------------------------------------------------------------------------
-- RLS — user_documents
-- ---------------------------------------------------------------------------
alter table public.user_documents enable row level security;

drop policy if exists "user_documents: read own" on public.user_documents;
create policy "user_documents: read own" on public.user_documents
    for select using (auth.uid() = user_id and deleted_at is null);

drop policy if exists "user_documents: insert own" on public.user_documents;
create policy "user_documents: insert own" on public.user_documents
    for insert with check (auth.uid() = user_id);

drop policy if exists "user_documents: update own" on public.user_documents;
create policy "user_documents: update own" on public.user_documents
    for update using (auth.uid() = user_id);

drop policy if exists "user_documents: delete own" on public.user_documents;
create policy "user_documents: delete own" on public.user_documents
    for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RLS — case_documents (a user can attach any of their docs to any of
-- their cases; both sides of the join must be owned by them)
-- ---------------------------------------------------------------------------
alter table public.case_documents enable row level security;

drop policy if exists "case_documents: read via case" on public.case_documents;
create policy "case_documents: read via case" on public.case_documents
    for select using (
        exists (
            select 1 from public.recovery_cases c
            where c.id = case_documents.case_id and c.user_id = auth.uid()
        )
    );

drop policy if exists "case_documents: write via case" on public.case_documents;
create policy "case_documents: write via case" on public.case_documents
    for all using (
        exists (
            select 1 from public.recovery_cases c
            where c.id = case_documents.case_id and c.user_id = auth.uid()
        ) and exists (
            select 1 from public.user_documents d
            where d.id = case_documents.document_id and d.user_id = auth.uid()
        )
    ) with check (
        exists (
            select 1 from public.recovery_cases c
            where c.id = case_documents.case_id and c.user_id = auth.uid()
        ) and exists (
            select 1 from public.user_documents d
            where d.id = case_documents.document_id and d.user_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------------
-- Storage bucket for the actual PDF blobs.
-- Private bucket; the backend uses the service role to write/read and
-- hands out short-lived signed URLs to clients.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
