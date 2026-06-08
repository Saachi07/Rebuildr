-- Seed the resources catalog. These are the hand-curated entries from the
-- `questions` branch. The scraper pipeline will append additional rows
-- using the same shape.

insert into public.resources
    (id, type, title, body, url, phone, region, disaster_types, supports_plans, requires, excludes, insurance_companies, eligibility_days, scraped_at)
values
    ('ab-drp', 'policy',
     'Alberta Disaster Recovery Program (DRP)',
     'Provincial program covering uninsurable losses from declared disasters — personal essentials, structural repair, temporary lodging.',
     'https://alberta.ca/disaster-recovery-programs', '310-4455',
     'AB', '{wildfire,flood,tornado,*}', '{4,7,10,11}', '{}', '{on_reserve_or_metis}', null, 90, null),

    ('ei', 'financial',
     'Employment Insurance (EI) — disaster provisions',
     'Federal income support during work interruptions. Service Canada often activates expedited processing for declared disasters, even without a formal layoff.',
     'https://canada.ca/ei', '1-800-206-7218',
     '*', '{*}', '{4,5}', '{income_disrupted}', '{}', null, null, null),

    ('isc-emap', 'policy',
     'Indigenous Services Canada — Emergency Management Assistance Program',
     'Covers eligible response and recovery costs for on-reserve communities. Coordinated through the band office.',
     'https://sac-isc.gc.ca/eng/1534954090122', '1-800-567-9604',
     '*', '{*}', '{2,3}', '{on_reserve_or_metis}', '{}', null, null, null),

    ('cra-disaster-relief', 'financial',
     'CRA Taxpayer Relief — disaster provisions',
     'Cancellation of penalties and interest on tax debt for taxpayers affected by a declared disaster. Filing extensions also available.',
     'https://canada.ca/en/revenue-agency/services/about-canada-revenue-agency-cra/complaints-disputes/cancel-waive-penalties-interest.html',
     '1-800-959-8281',
     '*', '{*}', '{4,5,8,9,10,11}', '{}', '{}', null, null, null),

    ('ab-income-support', 'financial',
     'Alberta Works — Income Support',
     'Short-term emergency financial help for Albertans whose income has dropped below basic-needs thresholds.',
     'https://alberta.ca/income-support', '1-866-644-5135',
     'AB', '{*}', '{4,7}', '{income_disrupted}', '{}', null, null, null),

    ('aish', 'financial',
     'AISH caseworker — update your file',
     'If you were already receiving AISH or Income Support, contact your caseworker to update your address and confirm direct deposit continues.',
     'https://alberta.ca/aish', '1-877-644-9992',
     'AB', '{*}', '{4}', '{on_assistance}', '{}', null, null, null),

    ('red-cross-lodging', 'shelter',
     'Canadian Red Cross — Emergency Lodging',
     '24/7 emergency lodging and immediate financial assistance for people displaced by a disaster.',
     'https://redcross.ca', '1-800-418-1111',
     '*', '{*}', '{0,7}', '{}', '{}', null, null, null),

    ('211-alberta', 'community',
     '211 Alberta — Community Resource Line',
     'Free 24/7 connector to local shelters, food banks, mental-health supports, and disaster assistance. Just dial 211.',
     'https://ab.211.ca', '211',
     'AB', '{*}', '{0,4,7,10}', '{}', '{}', null, null, null),

    ('salvation-army-ab', 'community',
     'Salvation Army Alberta — Emergency Disaster Services',
     'Mobile feeding, hydration, and emotional/spiritual care at evacuation centres across Alberta.',
     'https://salvationarmy.ca', null,
     'AB', '{*}', '{0,7}', '{}', '{}', null, null, null),

    ('ahs-health-link', 'health',
     'AHS Health Link — 811',
     '24/7 free nurse advice line. Useful for prescription refills lost in the disaster, or any non-emergency medical question.',
     'https://albertahealthservices.ca/healthlink', '811',
     'AB', '{*}', '{0,1,2,3,4,5,6,7,8,9,10,11}', '{}', '{}', null, null, null),

    ('hope-for-wellness', 'health',
     'Hope for Wellness Helpline',
     '24/7 culturally grounded mental health and crisis support for Indigenous people across Canada.',
     'https://hopeforwellness.ca', '1-855-242-3310',
     '*', '{*}', '{2,3}', '{on_reserve_or_metis}', '{}', null, null, null),

    ('ahs-mental-health', 'health',
     'Alberta Mental Health Helpline',
     '24/7 confidential support, information, and referrals for any mental-health concern. Long recovery processes are exhausting — this exists for exactly that.',
     'https://albertahealthservices.ca', '1-877-303-2642',
     'AB', '{*}', '{0,1,2,3,4,5,6,7,8,9,10,11}', '{}', '{}', null, null, null),

    ('ibc-consumer', 'financial',
     'Insurance Bureau of Canada — Consumer Info Centre',
     'Free help understanding your policy, the claims process, and what additional living expenses (ALE) coverage typically pays for.',
     'https://ibc.ca', '1-844-227-5422',
     '*', '{*}', '{5,6,8,9}', '{insured}', '{}', null, null, null),

    ('gio-ombud', 'financial',
     'General Insurance OmbudService',
     'Free, independent mediation if your insurance claim feels stuck or you''ve been denied something you think should be covered.',
     'https://giocanada.org', '1-877-225-0446',
     '*', '{*}', '{8}', '{insurance_claim_filed}', '{}', null, null, null),

    ('service-alberta-id', 'documents',
     'Service Alberta — replace ID',
     'Replacement driver''s licence, ID card, and registry documents. Fees are often waived for residents displaced by a declared disaster.',
     'https://alberta.ca/registry-agents', null,
     'AB', '{*}', '{1}', '{missing_id}', '{}', null, null, null),

    ('service-canada-sin', 'documents',
     'Service Canada — replace SIN and federal ID',
     'Replacement Social Insurance Number card and other federal identity documents.',
     'https://canada.ca/en/employment-social-development/services/sin.html', '1-800-622-6232',
     '*', '{*}', '{1}', '{missing_id}', '{}', null, null, null),

    ('habitat-ab', 'community',
     'Habitat for Humanity — Alberta chapters',
     'Long-term rebuild support and ReStore discounts for materials. Eligibility varies by chapter — worth a call.',
     'https://habitat.ca', null,
     'AB', '{wildfire,flood,tornado,*}', '{10,11}', '{owner}', '{}', null, null, null),

    ('samaritans-purse', 'community',
     'Samaritan''s Purse Canada — Disaster Relief',
     'Free volunteer crews for mud-out, ash-out, and chainsaw work after floods, wildfires, and tornadoes.',
     'https://samaritanspurse.ca', '1-866-628-6565',
     '*', '{wildfire,flood,tornado}', '{4,7,10,11}', '{}', '{}', null, 180, null)
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
