-- Item images.
--
-- Adds three image columns on case_items and a storage bucket to hold the
-- blobs. Mirrors the documents bucket setup (0004) but is public-read so the
-- frontend can render thumbnails with a plain <img src> — the stored value is
-- the object's public URL. Writes are restricted to the backend service role.
--
--   photo_url  — a representative photo of the item
--   before_url — photo of the item before the damage
--   after_url  — photo of the item after the damage

alter table public.case_items
    add column if not exists photo_url  text,
    add column if not exists before_url text,
    add column if not exists after_url  text;

-- Public-read bucket: the columns store get_public_url() values that the
-- browser loads directly. Object keys are namespaced by user_id and carry a
-- random uuid, so they are not enumerable. Flip `public` to false and serve
-- signed URLs (see documents.py) if these photos ever need to be private.
insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', true)
on conflict (id) do nothing;
