-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.signups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 20),
  phone text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists signups_created_at_idx on public.signups (created_at desc);

-- Vercel 서버(service_role)에서만 저장합니다.
alter table public.signups disable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.signups to service_role;

-- 이미 테이블을 만든 경우 권한만 다시 적용하려면 아래도 실행하세요.
-- alter table public.signups disable row level security;
-- grant select, insert, update, delete on public.signups to service_role;
