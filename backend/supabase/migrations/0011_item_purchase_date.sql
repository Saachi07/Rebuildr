-- Purchase date for inventory items.
--
-- Insurers settle contents claims on actual cash value (ACV, the depreciated
-- worth) unless the policyholder actually replaces the item, in which case they
-- pay replacement cost (RCV). A $500 TV bought two years ago might pay out ~$200
-- as ACV but the full $500 once you buy a new one. Survivors lose money here
-- because they cannot show how old an item was.
--
-- estimated_value already holds the replacement cost (RCV). Adding the purchase
-- date lets the app estimate the depreciated value (ACV) alongside it, so a
-- survivor walks into the claim conversation knowing both numbers. The ACV
-- estimate itself is computed in the app from this date and the item category,
-- so no extra stored column is needed.

alter table public.case_items
    add column if not exists purchase_date date;
