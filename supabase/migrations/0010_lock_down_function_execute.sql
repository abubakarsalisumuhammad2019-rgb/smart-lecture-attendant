-- Postgres grants EXECUTE to PUBLIC by default on newly created functions, so
-- the earlier `revoke ... from anon, authenticated` in migration 0009 didn't
-- fully lock these down (PUBLIC still had it). Close that off explicitly.
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.prevent_role_self_escalation() from public;
