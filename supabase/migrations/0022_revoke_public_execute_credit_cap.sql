-- Migration 0021's "revoke execute ... from anon, authenticated" left the
-- default PUBLIC grant in place (confirmed via pg_proc.proacl showing a bare
-- "=X" entry) -- anon/authenticated inherit execute through PUBLIC regardless
-- of an explicit per-role revoke, so the security advisor still flagged
-- enforce_credit_cap() as callable via /rest/v1/rpc/enforce_credit_cap.
revoke execute on function public.enforce_credit_cap() from public;
