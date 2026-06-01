create extension if not exists "pgcrypto";

create table recovery_cases (
  id                  uuid        primary key default gen_random_uuid(),
  case_name           text        not null,
  disaster_type       text        not null
                        check (disaster_type in (
                          'Flood', 'Fire', 'Storm', 'Hail',
                          'Smoke damage', 'Water damage',
                          'Earthquake', 'Evacuation', 'Other'
                        )),
  disaster_type_other text,
  location            text,
  incident_date       date        not null,
  case_status         text        not null default 'active'
                        check (case_status in ('active', 'needs_review', 'completed', 'archived')),
  insurance_provider  text,
  claim_number        text,
  policy_number       text,
  notes               text,
  preferred_language  text,
  low_bandwidth_mode  boolean     not null default false,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint disaster_type_other_required
    check (
      disaster_type <> 'Other'
      or nullif(btrim(disaster_type_other), '') is not null
    )
);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recovery_cases_updated_at
  before update on recovery_cases
  for each row execute procedure set_updated_at();
