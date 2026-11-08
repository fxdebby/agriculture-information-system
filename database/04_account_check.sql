-- =====================================================================
--  04_account_check.sql      (optional; safe to re-run)
--  Lets the sign-in page tell "this email is not registered" apart from
--  "wrong password". It returns only true or false and reveals nothing else.
--
--  Trade-off: anyone can now ask whether an email has an account. That is
--  fine for a small system where the administrator creates the accounts.
--  To switch the feature OFF again, run:   drop function public.account_exists(text);
--  (the sign-in page then simply says "Incorrect email or password.")
-- =====================================================================
create or replace function public.account_exists(p_email text) returns boolean
language sql stable security definer set search_path = public, auth as $$
    select exists (select 1 from auth.users where lower(email) = lower(trim(p_email)));
$$;
revoke all on function public.account_exists(text) from public;
grant execute on function public.account_exists(text) to anon, authenticated;
