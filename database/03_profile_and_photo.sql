-- =====================================================================
--  03_profile_and_photo.sql      (run ONCE, after 02_normalize.sql)
--  Adds: optional profile photo + the right for every user to edit
--  their own name and photo (but never their own role).
--  Safe to re-run.
-- =====================================================================

-- 1. Where the photo's file path is remembered (empty = no photo)
alter table profiles add column if not exists avatar_path text;

-- 2. A signed-in user may update ONLY their own profile row.
--    (Administrators can still update everyone, from the existing policy.)
drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles for update to authenticated
    using (id = auth.uid()) with check (id = auth.uid());

-- 3. ...but only an Administrator may ever change a role. (Changes made directly in the
--    Supabase SQL Editor have no signed-in user, so they are still allowed.)
create or replace function protect_profile_role() returns trigger language plpgsql as $$
begin
    if new.role_id is distinct from old.role_id and auth.uid() is not null and not is_admin() then
        raise exception 'Only an Administrator can change a role.' using errcode = '42501';
    end if;
    new.updated_at := now();
    return new;
end $$;
drop trigger if exists trg_protect_profile_role on profiles;
create trigger trg_protect_profile_role before update on profiles
    for each row execute function protect_profile_role();

-- 4. Private storage bucket for photos: JPEG only, max 1 MB each.
--    Each user can see and change only the files inside their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg'])
on conflict (id) do update
    set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_select_own" on storage.objects;
drop policy if exists "avatars_insert_own" on storage.objects;
drop policy if exists "avatars_update_own" on storage.objects;
drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_select_own" on storage.objects for select to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_insert_own" on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_update_own" on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_delete_own" on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
