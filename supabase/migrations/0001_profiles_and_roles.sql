-- Unified identity table for admin/lecturer/student, 1:1 with auth.users.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'student' check (role in ('admin', 'lecturer', 'student')),
  status text not null default 'active' check (status in ('active', 'pending', 'suspended')),
  usn text unique,
  age text,
  phone text,
  face_enrolled boolean not null default false,
  face_enrolled_at timestamptz,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create policy "profiles_admin_all" on public.profiles
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Auto-provisions a profile row whenever a new auth.users row is created.
-- Reads role/full_name from signUp's options.data (raw_user_meta_data).
-- Lecturers start 'pending' until an admin approves them; everyone else starts 'active'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  signup_role text;
begin
  signup_role := coalesce(new.raw_user_meta_data->>'role', 'student');
  if signup_role not in ('lecturer', 'student') then
    signup_role := 'student';
  end if;

  insert into public.profiles (id, email, full_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    signup_role,
    case when signup_role = 'lecturer' then 'pending' else 'active' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS is row-level, not column-level: a plain "update own row" policy would let
-- a student UPDATE their own role/status. This trigger blocks that specifically,
-- while still allowing admins (checked via the acting user's own row) to change
-- anyone's role/status.
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_role text;
begin
  select role into acting_role from public.profiles where id = auth.uid();
  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and coalesce(acting_role, '') <> 'admin' then
    raise exception 'Only admins may change role or status';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_self_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_self_escalation();
