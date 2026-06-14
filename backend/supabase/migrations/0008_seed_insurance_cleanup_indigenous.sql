-- Seed insurance-type guides, cleanup/volunteer organizations, and the
-- Indigenous recovery-pathway entries (sourced from the insurance-types /
-- cleanup-arrangement / Indigenous-benefits research doc). Mirrors the new
-- hand-curated entries in `questions/resources.py`.
--
-- Also re-upserts `isc-emap`: the 0003 seed used requires '{on_reserve}',
-- a tag the intake engine never derives, the correct tag is
-- 'on_reserve_or_metis' (see backend/app/services/tags.py). The body is
-- also expanded to note that residents don't apply directly.

insert into public.resources
    (id, type, title, body, url, phone, region, disaster_types, supports_plans, requires, excludes, insurance_companies, eligibility_days, scraped_at)
values
    -- ----- Fix + enrich existing Indigenous entry -------------------------
    ('isc-emap', 'policy',
     'Indigenous Services Canada, Emergency Management Assistance Program',
     'Covers eligible preparedness, response, evacuation, recovery, and rebuilding costs for on-reserve communities. Residents usually don''t apply directly, support is coordinated through the band office, the community, or ISC.',
     'https://sac-isc.gc.ca/eng/1534954090122', '1-800-567-9604',
     '*', '{*}', '{2,3}', '{on_reserve_or_metis}', '{}', null, null, null),

    -- ----- Volunteer cleanup organizations --------------------------------
    ('team-rubicon-canada', 'community',
     'Team Rubicon Canada, Disaster Response',
     'Free volunteer crews for debris removal, muck-outs, ash sifting, and damage assessment after floods, wildfires, and tornadoes. Veteran-led teams prioritize vulnerable households at no cost.',
     'https://team-rubicon.ca', null,
     '*', '{wildfire,flood,tornado}', '{4,7,10,11}', '{}', '{}', null, 180, null),

    ('mennonite-disaster-service', 'community',
     'Mennonite Disaster Service Canada',
     'Volunteer cleanup, repair, and full home rebuilding after disasters, focused on uninsured and underinsured households, seniors, and people with disabilities. No cost to the homeowner.',
     'https://mds.org', '1-866-261-1274',
     '*', '{wildfire,flood,tornado}', '{10,11}', '{}', '{}', null, null, null),

    -- ----- Cleanup pathways ------------------------------------------------
    ('cleanup-insured-pathway', 'rebuild',
     'Insurer-arranged cleanup and restoration',
     'If you''re insured, your insurance company is the first point of contact for cleanup. They assign an adjuster, approve restoration contractors, and can cover smoke cleanup, water extraction, debris removal, and repairs subject to policy limits. Don''t pay for cleanup yourself before asking your adjuster.',
     'https://ibc.ca', '1-844-227-5422',
     '*', '{*}', '{5,6,8,9}', '{insured}', '{}', null, null, null),

    ('cleanup-uninsured-pathway', 'rebuild',
     'Cleanup help when you''re uninsured',
     'No single organization handles cleanup for uninsured losses. Government programs like Alberta DRP usually provide funding rather than crews, while volunteer organizations, Samaritan''s Purse, Team Rubicon Canada, Mennonite Disaster Service, Salvation Army, and the Red Cross, provide free cleanup, debris removal, and rebuilding help, especially for vulnerable households.',
     'https://ab.211.ca', '211',
     'AB', '{*}', '{4,7,10,11}', '{uninsured}', '{}', null, null, null),

    -- ----- Indigenous recovery pathway -------------------------------------
    ('indigenous-insurance-pathway', 'insurance',
     'Insurance and recovery on reserve, what''s different',
     'There is no Indigenous-specific private insurance product, and on-reserve communities often face higher premiums, limited availability, and underinsurance. Recovery usually flows through EMAP, Indigenous Services Canada, and the band office rather than the standard insurance-then-DRP pathway, but if you do hold private home, tenant, or auto insurance, those claims run in parallel and are worth opening.',
     'https://sac-isc.gc.ca/eng/1534954090122', '1-800-567-9604',
     '*', '{*}', '{2,3}', '{on_reserve_or_metis}', '{}', null, null, null),

    -- ----- Insurance type guides --------------------------------------------
    ('ins-guide-homeowners', 'insurance',
     'Homeowners insurance, what it covers after a disaster',
     'Covers the dwelling, detached structures like garages and sheds, personal contents, liability, and additional living expenses (ALE) while your home is uninhabitable. Fire and hail are commonly covered; flood, overland water, and sewer backup usually require endorsements. Know your deductible and whether you have replacement cost or actual cash value before filing proof of loss.',
     'https://ibc.ca', '1-844-227-5422',
     '*', '{*}', '{5,8,9}', '{owner}', '{}', null, null, null),

    ('ins-guide-tenant', 'insurance',
     'Tenant insurance, what it covers after a disaster',
     'Covers your personal property, liability, and additional living expenses (ALE) like hotel and food if the rental is uninhabitable, the building itself is the landlord''s insurance. Smoke damage to belongings and displacement during repairs are typical claims; flood coverage is usually an optional endorsement.',
     'https://ibc.ca', '1-844-227-5422',
     '*', '{*}', '{5,6}', '{renter}', '{}', null, null, null),

    ('ins-guide-condo', 'insurance',
     'Condo insurance, unit, betterments, and assessments',
     'Covers your unit''s interior finishes and improvements (betterments), personal contents, liability, and sometimes special assessments from the condo corporation after a big building loss. The building envelope and common elements fall under the condo corporation''s master policy, ask about deductible assessment coverage.',
     'https://ibc.ca', '1-844-227-5422',
     '*', '{*}', '{5,8,9}', '{owner}', '{}', null, null, null),

    ('ins-guide-auto', 'insurance',
     'Auto insurance, hail, flood, and wildfire claims',
     'Comprehensive coverage handles most disaster losses to vehicles, hail damage, smoke, floodwater in the interior or engine, and fire during evacuation. Total losses pay out at actual cash value; ask about rental vehicle coverage and towing while yours is in repair.',
     'https://ibc.ca', '1-844-227-5422',
     '*', '{*}', '{5,6,8,9}', '{}', '{}', null, null, null),

    ('ins-guide-rv', 'insurance',
     'RV insurance, motorhomes and trailers in a disaster',
     'Covers motorhomes or trailers, the contents inside, liability, and often emergency accommodation if you''re stranded by road closures or campground displacement. Hail, wildfire smoke, and flood losses are typical claims under comprehensive coverage.',
     'https://ibc.ca', null,
     '*', '{*}', '{6,8,9}', '{}', '{}', null, null, null),

    ('ins-guide-boat', 'insurance',
     'Boat insurance, storm and wildfire losses',
     'Covers hull and machinery, liability, theft, sinking, and often salvage costs. Storm damage at the dock, hail, debris-damaged motors, and theft after emergency displacement are typical disaster claims, check navigation limits and lay-up period rules.',
     'https://ibc.ca', null,
     '*', '{*}', '{8,9}', '{}', '{}', null, null, null),

    ('ins-guide-farm', 'insurance',
     'Farm insurance, buildings, machinery, and displacement',
     'Package coverage for the farm dwelling, barns and outbuildings, machinery and equipment, and liability, sometimes business interruption and contents too. Wildfire loss to barns, wind damage to machine sheds, and hail-damaged equipment are typical claims; flood usually needs an endorsement.',
     'https://ibc.ca', null,
     '*', '{*}', '{5,8,9}', '{owner}', '{}', null, null, null),

    ('ins-guide-crop', 'insurance',
     'Crop insurance (AFSC), yield and quality losses',
     'Protects crop producers against production losses from insured perils, hail, flood, wind, frost, drought, and excess rain, including quality downgrades from wildfire smoke. Claims work through your acreage report, production guarantee, and an appraised loss; AFSC administers the program in Alberta.',
     'https://afsc.ca', '1-877-899-2372',
     'AB', '{*}', '{4,5}', '{}', '{}', null, null, null),

    ('ins-guide-livestock', 'insurance',
     'Livestock insurance, mortality and disaster losses',
     'Covers livestock mortality, transit losses, and specified farm-animal risks depending on the program. Barn fires, smoke inhalation, injuries during evacuation, and flood-related mortality are typical disaster claims, valuation and salvage rules drive the payout.',
     'https://afsc.ca', '1-877-899-2372',
     'AB', '{*}', '{4,5}', '{}', '{}', null, null, null),

    ('ins-guide-business', 'insurance',
     'Business insurance, operations, assets, and liability',
     'Package policies combine property, liability, crime, equipment breakdown, and optional business interruption coverage. Store closures after evacuation, inventory lost to flooding or smoke, and customer injuries on damaged premises are typical disaster claims, flood and catastrophe risks may need endorsements.',
     'https://ibc.ca', '1-844-227-5422',
     '*', '{*}', '{4,5}', '{}', '{}', null, null, null),

    ('ins-guide-commercial-property', 'insurance',
     'Commercial property insurance, buildings and stock',
     'Covers business buildings, inventory, equipment, signage, and sometimes tenant improvements. Hail-collapsed roofs, wildfire-destroyed contents, and spoiled freezer stock after outages are typical claims; earthquake and flood often need separate buybacks or endorsements.',
     'https://ibc.ca', '1-844-227-5422',
     '*', '{*}', '{5,8,9}', '{}', '{}', null, null, null),

    ('ins-guide-business-interruption', 'insurance',
     'Business interruption insurance, lost income during shutdown',
     'Replaces lost income and extra expenses after an insured shutdown, payroll, rent, taxes, and relocation costs during evacuations, road closures, or long rebuilds. Coverage only triggers if the underlying property damage is covered; watch the waiting period and indemnity period limits.',
     'https://ibc.ca', '1-844-227-5422',
     '*', '{*}', '{4,5}', '{income_disrupted}', '{}', null, null, null),

    ('ins-guide-life', 'insurance',
     'Life insurance, claims after a disaster-related death',
     'Pays a death benefit to beneficiaries and can support mortgage payoff or family recovery after a disaster-related death. Beneficiaries file with proof of death; term and permanent policies both apply as long as the policy hadn''t lapsed.',
     'https://clhia.ca', null,
     '*', '{*}', '{4,5}', '{}', '{}', null, null, null),

    ('ins-guide-disability', 'insurance',
     'Disability insurance, income replacement after injury',
     'Replaces monthly income when illness or injury prevents work, including injuries during evacuation, smoke inhalation, or post-disaster stress claims depending on the policy. Check the elimination period and whether your policy uses an own-occupation or any-occupation definition.',
     'https://clhia.ca', null,
     '*', '{*}', '{4,5}', '{income_disrupted}', '{}', null, null, null),

    ('ins-guide-critical-illness', 'insurance',
     'Critical illness insurance, lump sum after diagnosis',
     'Pays a one-time lump sum after diagnosis of a covered serious illness such as cancer, heart attack, or stroke, including illness following prolonged disaster stress or delayed treatment. The payout is yours to use for care, travel, or household costs during the rebuild; survival periods and covered-condition lists apply.',
     'https://clhia.ca', null,
     '*', '{*}', '{4,5}', '{}', '{}', null, null, null),

    ('ins-guide-extended-health', 'insurance',
     'Extended health insurance, medication and counselling',
     'Pays for medical services beyond public coverage, prescription drug replacement after evacuation, counselling and physiotherapy, dental, vision, and medical supplies. Lost medications, injury rehab after cleanup, and mental health support after trauma are typical disaster uses; check annual maximums and co-pays.',
     'https://clhia.ca', null,
     '*', '{*}', '{0,5,6,8,9}', '{}', '{}', null, null, null),

    ('ins-guide-travel', 'insurance',
     'Travel insurance, disasters during or interrupting a trip',
     'Covers trip cancellation or interruption, emergency medical, baggage, and delays, natural disasters can trigger interruption benefits if your home becomes uninhabitable or wildfire road closures strand you. File with proof of the event and claim the unused portion of the trip.',
     'https://clhia.ca', null,
     '*', '{*}', '{0}', '{}', '{}', null, null, null),

    ('ins-guide-mortgage', 'insurance',
     'Mortgage insurance, keeping payments current',
     'Mortgage life insurance pays the lender or beneficiaries on death; mortgage disability and critical illness riders can make your payments if you can''t work after a disaster-related injury or illness. Watch waiting periods and benefit limits, and check this coverage before missing a payment.',
     'https://clhia.ca', null,
     '*', '{*}', '{4,5,8,9}', '{owner}', '{}', null, null, null)

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
