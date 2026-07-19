insert into public.app_settings (key, value)
values ('join_window_minutes', '20')
on conflict (key) do nothing;
