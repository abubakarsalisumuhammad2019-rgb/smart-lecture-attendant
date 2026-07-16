-- Root cause of every bulk-imported/invited lecturer landing on
-- status='pending' instead of 'active': admin-invite-user's follow-up
-- `.update({ status: 'active' })` runs on the service-role client, which has
-- no user JWT (no `sub` claim) -- auth.uid() is null in that context, so
-- prevent_role_self_escalation's `acting_role` lookup resolves to null,
-- coalesces to '', and the trigger blocks the update as if a non-admin were
-- trying to self-escalate. Confirmed live: the same UPDATE statement throws
-- "Only admins may change role or status" outside a real user session.
--
-- Service-role callers are already gated at the application layer (every
-- edge function that writes profiles.role/status checks
-- caller.role === 'admin' before ever reaching this table), so this trigger
-- re-checking admin-ness for them is redundant and, as shown, actively wrong
-- since it has no user session to check against. Exempt only the well-defined
-- service_role JWT claim -- an ordinary missing/anonymous auth.uid() (e.g. a
-- student's own session) still falls through to the original check.
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_role text;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  select role into acting_role from public.profiles where id = auth.uid();
  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and coalesce(acting_role, '') <> 'admin' then
    raise exception 'Only admins may change role or status';
  end if;
  return new;
end;
$$;
