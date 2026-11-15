-- =====================================================================
--  05_roles_and_requests.sql        (run once, after 04; safe to re-run)
--
--  Three roles:   Administrator (exactly 1)  >  Moderator (any number)  >  Staff (any number)
--
--  Administrator : changes records directly, manages crops and lookup values, sees all
--                  accounts, changes roles and can KICK OUT any member.
--  Moderator     : changes records (crops included) directly, and approves / rejects staff requests.
--  Staff         : cannot change records directly. Add / edit / delete are sent as
--                  REQUESTS (farmers, farms, crops, plantings, harvests); an administrator
--                  or moderator approves or rejects them.
--
--  Everything is enforced here in the database, not only on screen.
-- =====================================================================

-- 1. Moderator role and ranking ----------------------------------------
alter table ref_user_role add column if not exists rank smallint;
insert into ref_user_role (role_id, role_description) values (3, 'Moderator') on conflict (role_id) do nothing;
update ref_user_role set rank = case role_id when 1 then 1 when 3 then 2 else 3 end;

-- 2. Exactly one administrator -----------------------------------------
--    (If this fails, you currently have two administrators: demote one first.)
create unique index if not exists one_administrator on profiles ((true)) where role_id = 1;

-- 3. Who is calling? ----------------------------------------------------
create or replace function my_role() returns integer
language sql stable security definer set search_path = public as $$
    select role_id from profiles where id = auth.uid();
$$;
create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from profiles where id = auth.uid());
$$;
create or replace function is_approver() returns boolean
language sql stable security definer set search_path = public as $$
    select coalesce((select role_id in (1, 3) from profiles where id = auth.uid()), false);
$$;

-- 4. Only the administrator may change roles, and never the administrator's own ----
create or replace function protect_profile_role() returns trigger language plpgsql as $$
begin
    if new.role_id is distinct from old.role_id and auth.uid() is not null then
        if not is_admin() then
            raise exception 'Only the administrator can change a role.' using errcode = '42501';
        end if;
        if old.role_id = 1 or new.role_id = 1 then
            raise exception 'The administrator role cannot be changed here.' using errcode = '42501';
        end if;
    end if;
    new.updated_at := now();
    return new;
end $$;

-- 5. Row Level Security: staff may read, but not write, the operational tables ----
--    Membership is required everywhere, so a member who was kicked out loses access
--    immediately, even before their sign-in token expires.
do $$
declare t text;
begin
    foreach t in array array['farmer','farm','planting','harvest'] loop
        execute format('drop policy if exists "%1$s_select" on %1$I', t);
        execute format('drop policy if exists "%1$s_insert" on %1$I', t);
        execute format('drop policy if exists "%1$s_update" on %1$I', t);
        execute format('drop policy if exists "%1$s_delete" on %1$I', t);
        execute format('create policy "%1$s_select" on %1$I for select to authenticated using (is_member())', t);
        execute format('create policy "%1$s_insert" on %1$I for insert to authenticated with check (is_approver())', t);
        execute format('create policy "%1$s_update" on %1$I for update to authenticated using (is_approver()) with check (is_approver())', t);
        execute format('create policy "%1$s_delete" on %1$I for delete to authenticated using (is_approver())', t);
    end loop;
    foreach t in array array['crop','ref_user_role','ref_province','ref_city_municipality','ref_crop_category','ref_season',
                             'ref_soil_type','ref_irrigation_type','ref_planting_status','ref_quality_grade','ref_harvest_remark'] loop
        execute format('drop policy if exists "%1$s_select" on %1$I', t);
        execute format('create policy "%1$s_select" on %1$I for select to authenticated using (is_member())', t);
    end loop;
end $$;

-- Crops: the administrator AND moderators change crops directly (staff send requests).
-- (The lookup tables - categories, seasons, soil types ... - stay administrator-only.)
drop policy if exists "crop_write"  on crop;
drop policy if exists "crop_insert" on crop;
drop policy if exists "crop_update" on crop;
drop policy if exists "crop_delete" on crop;
create policy "crop_insert" on crop for insert to authenticated with check (is_approver());
create policy "crop_update" on crop for update to authenticated using (is_approver()) with check (is_approver());
create policy "crop_delete" on crop for delete to authenticated using (is_approver());

-- 6. The request queue ----------------------------------------------------
create table if not exists change_request (
    request_id        bigint generated always as identity primary key,
    table_name        text not null check (table_name in ('farmer','farm','crop','planting','harvest')),
    action            text not null check (action in ('insert','update','delete')),
    record_id         bigint,
    payload           jsonb not null default '{}'::jsonb,   -- the values staff want to save
    previous          jsonb,                                -- the record as it was when requested
    status            text not null default 'pending' check (status in ('pending','approved','rejected')),
    requested_by      uuid references auth.users(id) on delete set null,
    requested_by_name text,
    requested_at      timestamptz not null default now(),
    decided_by        uuid references auth.users(id) on delete set null,
    decided_by_name   text,
    decided_at        timestamptz,
    constraint chk_request_record check ((action = 'insert') = (record_id is null))
);
-- Requests of a kind this version does not have (e.g. left over from an older experiment) are removed,
-- otherwise the stricter rule below could not be applied.
delete from change_request where table_name not in ('farmer','farm','crop','planting','harvest');
-- Databases that already have this table: allow crop requests too (safe to re-run).
alter table change_request drop constraint if exists change_request_table_name_check;
alter table change_request add constraint change_request_table_name_check
    check (table_name in ('farmer','farm','crop','planting','harvest'));
-- "Closed" = hidden from the Requests list of the administrator AND the moderators (shared by both).
alter table change_request add column if not exists closed boolean not null default false;
create index if not exists idx_request_status on change_request (status, requested_at desc);
alter table change_request enable row level security;
drop policy if exists "request_select" on change_request;
create policy "request_select" on change_request for select to authenticated
    using (is_approver() or requested_by = auth.uid());
-- (no insert / update / delete policies: requests are created and decided only by the functions below)

-- 7. Functions ------------------------------------------------------------
-- Which columns of a table may a request set? (never ids or audit columns)
create or replace function change_columns(p_table text, p_payload jsonb) returns text[]
language sql stable set search_path = public as $$
    select coalesce(array_agg(k order by k), '{}'::text[])
    from jsonb_object_keys(p_payload) k
    where k in (select column_name::text from information_schema.columns where table_schema = 'public' and table_name = p_table)
      and k not in (p_table || '_id', 'created_at', 'updated_at', 'created_by', 'updated_by');
$$;

-- Carries out one change. Internal: only decide_request calls it.
create or replace function apply_change(p_table text, p_action text, p_record bigint, p_payload jsonb, p_by uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
    cols text[]; col_list text; pk text := p_table || '_id'; n integer;
begin
    if p_table not in ('farmer','farm','crop','planting','harvest') then raise exception 'Unknown table.' using errcode = 'P0001'; end if;
    if p_action = 'delete' then
        execute format('delete from %I where %I = $1', p_table, pk) using p_record;
        get diagnostics n = row_count;
        if n = 0 then raise exception 'That record no longer exists.' using errcode = 'P0001'; end if;
        return;
    end if;
    cols := change_columns(p_table, p_payload);
    if coalesce(array_length(cols, 1), 0) = 0 then raise exception 'The request contains no data.' using errcode = 'P0001'; end if;
    select string_agg(quote_ident(c), ', ') into col_list from unnest(cols) c;
    if p_action = 'insert' then
        execute format('insert into %1$I (%2$s, created_by) select %2$s, $2 from jsonb_populate_record(null::%1$I, $1)', p_table, col_list)
            using p_payload, p_by;
    else
        execute format('update %1$I set (%2$s) = (select %2$s from jsonb_populate_record(null::%1$I, $1)) where %3$I = $2', p_table, col_list, pk)
            using p_payload, p_record;
        get diagnostics n = row_count;
        if n = 0 then raise exception 'That record no longer exists.' using errcode = 'P0001'; end if;
    end if;
end $$;

-- Staff: send a request.
create or replace function submit_request(p_table text, p_action text, p_record bigint, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
    v_role integer := my_role(); v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
    v_prev jsonb; v_name text; v_id bigint; v_cols text[];
begin
    if v_role is null then raise exception 'Your account is no longer active.' using errcode = '42501'; end if;
    if v_role <> 2 then raise exception 'Administrators and moderators change records directly.' using errcode = 'P0001'; end if;
    if p_table not in ('farmer','farm','crop','planting','harvest') then raise exception 'Unknown table.' using errcode = 'P0001'; end if;
    if p_action not in ('insert','update','delete') then raise exception 'Unknown action.' using errcode = 'P0001'; end if;
    if p_action = 'insert' then
        p_record := null;
    else
        if p_record is null then raise exception 'Choose a record.' using errcode = 'P0001'; end if;
        execute format('select to_jsonb(t) from %I t where %I = $1', p_table, p_table || '_id') into v_prev using p_record;
        if v_prev is null then raise exception 'That record no longer exists.' using errcode = 'P0001'; end if;
    end if;
    if p_action = 'delete' then
        v_payload := '{}'::jsonb;
    else
        v_cols := change_columns(p_table, v_payload);
        if coalesce(array_length(v_cols, 1), 0) = 0 then raise exception 'The request contains no data.' using errcode = 'P0001'; end if;
        select jsonb_object_agg(k, v_payload -> k) into v_payload from unnest(v_cols) k;   -- keep allowed columns only
        begin
            execute format('select 1 from jsonb_populate_record(null::%I, $1)', p_table) using v_payload;
        exception when others then
            raise exception 'Some of the values are not valid.' using errcode = 'P0001';
        end;
    end if;
    select coalesce(nullif(full_name, ''), email) into v_name from profiles where id = auth.uid();
    insert into change_request (table_name, action, record_id, payload, previous, requested_by, requested_by_name)
    values (p_table, p_action, p_record, v_payload, v_prev, auth.uid(), v_name) returning request_id into v_id;
    return jsonb_build_object('request_id', v_id);
end $$;

-- Administrator / moderator: approve (applies the change) or reject.
create or replace function decide_request(p_id bigint, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r change_request%rowtype; v_name text;
begin
    if not is_approver() then raise exception 'Only the administrator or a moderator can decide requests.' using errcode = '42501'; end if;
    select * into r from change_request where request_id = p_id for update;
    if not found then raise exception 'Request not found.' using errcode = 'P0001'; end if;
    if r.status <> 'pending' then raise exception 'This request was already decided.' using errcode = 'P0001'; end if;
    if p_approve then perform apply_change(r.table_name, r.action, r.record_id, r.payload, r.requested_by); end if;
    select coalesce(nullif(full_name, ''), email) into v_name from profiles where id = auth.uid();
    update change_request set status = case when p_approve then 'approved' else 'rejected' end,
           decided_by = auth.uid(), decided_by_name = v_name, decided_at = now()
     where request_id = p_id;
    return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end);
end $$;

-- Administrator or moderator: close (hide) or restore requests. Shared: both of them see the same list.
create or replace function close_requests(p_ids bigint[], p_closed boolean) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
    if not is_approver() then raise exception 'Only the administrator or a moderator can close requests.' using errcode = '42501'; end if;
    update change_request set closed = p_closed
     where request_id = any(coalesce(p_ids, '{}'::bigint[])) and closed is distinct from p_closed;
    get diagnostics n = row_count;
    return n;
end $$;

-- Administrator only: permanently delete CLOSED requests ("Delete permanently" on the Requests tab).
create or replace function delete_requests(p_ids bigint[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
    if not is_admin() then raise exception 'Only the administrator can delete requests.' using errcode = '42501'; end if;
    delete from change_request where request_id = any(coalesce(p_ids, '{}'::bigint[])) and closed;
    get diagnostics n = row_count;
    return n;
end $$;

-- Administrator only: kick a member out (removes the account for good).
create or replace function kick_member(p_id uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_role integer;
begin
    if not is_admin() then raise exception 'Only the administrator can kick out members.' using errcode = '42501'; end if;
    if p_id = auth.uid() then raise exception 'You cannot kick out yourself.' using errcode = 'P0001'; end if;
    select role_id into v_role from profiles where id = p_id;
    if v_role is null then raise exception 'That member no longer exists.' using errcode = 'P0001'; end if;
    if v_role = 1 then raise exception 'The administrator cannot be kicked out.' using errcode = 'P0001'; end if;
    delete from auth.users where id = p_id;     -- their profile goes with it; their old requests keep the name
end $$;

revoke all on function submit_request(text, text, bigint, jsonb) from public;
revoke all on function decide_request(bigint, boolean) from public;
revoke all on function kick_member(uuid) from public;
revoke all on function delete_requests(bigint[]) from public;
revoke all on function close_requests(bigint[], boolean) from public;
revoke all on function apply_change(text, text, bigint, jsonb, uuid) from public, anon, authenticated;
grant execute on function submit_request(text, text, bigint, jsonb) to authenticated;
grant execute on function decide_request(bigint, boolean) to authenticated;
grant execute on function kick_member(uuid) to authenticated;
grant execute on function delete_requests(bigint[]) to authenticated;
grant execute on function close_requests(bigint[], boolean) to authenticated;
grant execute on function my_role(), is_member(), is_approver() to authenticated;

-- 8. The administrator can see and remove other members' profile photos -------
drop policy if exists "avatars_select_admin" on storage.objects;
drop policy if exists "avatars_delete_admin" on storage.objects;
create policy "avatars_select_admin" on storage.objects for select to authenticated
    using (bucket_id = 'avatars' and is_admin());
create policy "avatars_delete_admin" on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and is_admin());

-- 9. Removing an account must clear the "created by / updated by" links ----------
--    The audit trigger used to undo the database's own clean-up when a member is
--    kicked out. A foreign-key action runs one trigger level deeper than a normal
--    edit, so it is now left alone.
create or replace function set_audit_fields() returns trigger language plpgsql as $$
begin
    if tg_op = 'INSERT' then
        new.created_at := now();
        new.updated_at := now();
        new.created_by := coalesce(new.created_by, auth.uid());
        new.updated_by := auth.uid();
    else
        if pg_trigger_depth() > 1 then return new; end if;   -- clean-up after a removed account, not a user edit
        new.created_at := old.created_at;
        new.created_by := old.created_by;
        new.updated_at := now();
        new.updated_by := auth.uid();
    end if;
    return new;
end $$;
