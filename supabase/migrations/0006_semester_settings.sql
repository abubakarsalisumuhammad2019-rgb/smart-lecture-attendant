create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

create policy "app_settings_select_authenticated" on public.app_settings
  for select using (auth.role() = 'authenticated');

create policy "app_settings_admin_write" on public.app_settings
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

insert into public.app_settings (key, value) values
  ('active_academic_session', '2025_2026'),
  ('active_semester', 'first'),
  ('facilitation_start', ''),
  ('facilitation_end', '');
