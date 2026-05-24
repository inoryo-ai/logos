-- Logos マルチテナント基礎 (ADR-004 / Week 1)
-- 全テーブルが tenant_id を持ち、RLS でテナント間遮断する原則を確立する。
-- 適用順: 0001 → 0002 → 0003 → 0004

set search_path = public;

create extension if not exists "uuid-ossp";
create extension if not exists "vector";          -- ADR-003 AnnotationCache 用
create extension if not exists "pgcrypto";

-- ========== tenants ==========
create table tenants (
    id           uuid primary key default uuid_generate_v4(),
    slug         text unique not null,            -- "wf" / "tenant_b" 等
    name         text not null,
    plan         text not null default 'starter', -- starter / pro / enterprise
    cost_limit_jpy_monthly  integer not null default 10000,
    created_at   timestamptz not null default now(),
    deleted_at   timestamptz
);

-- ========== tenant_members ==========
create table tenant_members (
    tenant_id  uuid not null references tenants(id) on delete cascade,
    user_id    uuid not null,                     -- Supabase Auth uid
    role       text not null check (role in ('owner','operator','viewer')),
    created_at timestamptz not null default now(),
    primary key (tenant_id, user_id)
);

create index on tenant_members (user_id);

-- ========== helper: current_tenant_ids() ==========
-- リクエスト中の Supabase Auth user が所属する tenant_id 集合を返す
create or replace function public.current_tenant_ids()
returns setof uuid
language sql
stable
as $$
  select tenant_id
  from public.tenant_members
  where user_id = auth.uid();
$$;

-- ========== RLS 有効化 ==========
alter table tenants enable row level security;
alter table tenant_members enable row level security;

create policy tenants_member_select on tenants
    for select using (id in (select current_tenant_ids()));

create policy tenant_members_self_select on tenant_members
    for select using (user_id = auth.uid() or tenant_id in (select current_tenant_ids()));

-- 書込は service_role のみ (アプリ側 admin API 経由)
create policy tenants_service_write on tenants
    for all to service_role using (true) with check (true);
create policy tenant_members_service_write on tenant_members
    for all to service_role using (true) with check (true);
