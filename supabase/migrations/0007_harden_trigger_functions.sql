-- Pin search_path (missed on this one function in migration 0004).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- handle_new_user / prevent_role_self_escalation are trigger-only functions and
-- take no arguments, so PostgREST auto-exposes them as public RPC endpoints
-- (/rest/v1/rpc/...). They rely on trigger-only context (NEW/OLD), so they were
-- never meant to be called directly -- close that off explicitly.
revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.prevent_role_self_escalation() from anon, authenticated;
