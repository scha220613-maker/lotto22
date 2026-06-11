-- Supabase SQL Editor에서 실행하세요.

create table if not exists public.signups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 20),
  phone text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists signups_created_at_idx on public.signups (created_at desc);

alter table public.signups enable row level security;

-- 서버(Vercel)는 service_role 키로 저장하므로 별도 insert 정책은 필요 없습니다.
-- anon 키로 직접 접근하는 insert는 차단합니다.
revoke all on public.signups from anon, authenticated;
