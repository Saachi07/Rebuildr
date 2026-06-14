-- Seed legal-escalation resources: where to turn when a claim is denied,
-- reduced, or the insurer's story changes. Driven by a survivor interview
-- (insurer misrepresented personal property coverage, and she only got
-- traction after hiring a lawyer) and by feedback from an insurance
-- litigation lawyer.
--
-- Entries tagged requires '{denial_received}' surface once the document
-- pipeline detects denial language; the general entries are unrestricted
-- so any insured user can find them before things go wrong.

insert into public.resources
    (id, type, title, body, url, phone, region, disaster_types, supports_plans, requires, excludes, insurance_companies, eligibility_days, scraped_at)
values
    ('legal-when-to-get-lawyer', 'legal',
     'When to involve a lawyer in an insurance claim',
     'Consider a lawyer when your insurer denies a claim you believe is covered, tells you something different from what your policy says, delays without explanation, or offers far less than your documented losses. Many insurance lawyers offer a free first consultation, and some work on contingency. Bring your policy, your claim correspondence, and your communications log.',
     'https://www.lawsociety.ab.ca/public/finding-a-lawyer/', null,
     'AB', '{*}', '{5,8,9}', '{}', '{}', null, null, null),

    ('legal-aid-alberta', 'legal',
     'Legal Aid Alberta',
     'Low-cost or free legal help for Albertans with limited income. Insurance disputes are not always covered, but intake can point you to the right service, and family or housing issues that follow a disaster often qualify. Call to check whether you are eligible.',
     'https://www.legalaid.ab.ca', '1-866-845-3425',
     'AB', '{*}', '{5,8,9}', '{}', '{}', null, null, null),

    ('law-society-ab-referral', 'legal',
     'Law Society of Alberta lawyer directory',
     'Free public directory for finding an Alberta lawyer by area of practice, including insurance law. Look for lawyers practicing insurance or civil litigation, and ask about a free initial consultation before committing.',
     'https://www.lawsociety.ab.ca/public/finding-a-lawyer/', null,
     'AB', '{*}', '{5,8,9}', '{}', '{}', null, null, null),

    ('gio-ombud-escalation', 'legal',
     'General Insurance OmbudService (GIO) complaint',
     'Free, independent complaint service for disputes with home, auto, and business insurers in Canada. Use it after you have exhausted your insurer''s internal complaint process: ask your insurer for a final position letter first, then bring that letter to GIO. There is no cost and no lawyer is required.',
     'https://giocanada.org', '1-877-225-0446',
     '*', '{*}', '{5,8,9}', '{denial_received}', '{}', null, null, null),

    ('aic-licensee-complaint', 'legal',
     'Alberta Insurance Council complaints',
     'If an insurance agent or adjuster misled you, the Alberta Insurance Council investigates complaints about the conduct of licensed insurance professionals in Alberta. This is about the person''s conduct, not the claim amount; pair it with GIO or a lawyer for the claim itself.',
     'https://www.abcouncil.ab.ca', null,
     'AB', '{*}', '{5,8,9}', '{denial_received}', '{}', null, null, null),

    ('public-adjusters-alberta', 'legal',
     'Public adjusters: an adjuster who works for you',
     'A public adjuster documents and negotiates your claim on your behalf, unlike the insurer''s adjuster, who works for the insurance company. They typically charge a percentage of the settlement, often 5 to 20 percent, so they make the most sense for large or disputed claims. Confirm they are licensed in Alberta before signing anything.',
     'https://www.abcouncil.ab.ca', null,
     'AB', '{*}', '{5,8,9}', '{denial_received}', '{}', null, null, null),

    ('legal-insurer-misinformed', 'legal',
     'Your insurer told you something your policy contradicts: what now',
     'First, put it in writing: note the date, who you spoke with, and exactly what they said, and ask them to confirm it by email. Compare it against your policy wording, your policy is the contract that governs. If the two conflict, escalate in order: your adjuster''s manager, the insurer''s internal ombudsman, then GIO or a lawyer. Keep every receipt and never sign a release you do not fully understand.',
     'https://giocanada.org', '1-877-225-0446',
     '*', '{*}', '{5,8,9}', '{denial_received}', '{}', null, null, null)

on conflict (id) do update set
    type = excluded.type,
    title = excluded.title,
    body = excluded.body,
    url = excluded.url,
    phone = excluded.phone,
    region = excluded.region,
    disaster_types = excluded.disaster_types,
    supports_plans = excluded.supports_plans,
    requires = excluded.requires,
    excludes = excluded.excludes,
    insurance_companies = excluded.insurance_companies,
    eligibility_days = excluded.eligibility_days,
    scraped_at = excluded.scraped_at;
