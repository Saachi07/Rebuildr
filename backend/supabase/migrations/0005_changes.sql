-- Round 2 schema changes.
--
-- 1. Drop insurance_provider + insurance_policy_number from recovery_cases.
-- 2. Detach documents from cases: drop case_documents join.
-- 3. Documents: drop the user-supplied doc_type constraint, add analysis
--    columns so Gemini results live alongside the file.
-- 4. Profiles: track terms acceptance (timestamp + version string).

-- ---------------------------------------------------------------------------
-- recovery_cases: drop insurance fields
-- ---------------------------------------------------------------------------
alter table public.recovery_cases drop column if exists insurance_provider;
alter table public.recovery_cases drop column if exists insurance_policy_number;

-- ---------------------------------------------------------------------------
-- Detach documents from cases
-- ---------------------------------------------------------------------------
drop table if exists public.case_documents;

-- ---------------------------------------------------------------------------
-- user_documents: analysis columns + classified doc type
-- doc_type stays but now holds Gemini's classification (not user input).
-- ---------------------------------------------------------------------------
alter table public.user_documents
    add column if not exists analyzed_at      timestamptz,
    add column if not exists gemini_analysis  jsonb;

-- ---------------------------------------------------------------------------
-- profiles: terms acceptance tracking
-- ---------------------------------------------------------------------------
alter table public.profiles
    add column if not exists terms_accepted_at  timestamptz,
    add column if not exists terms_version      text;
