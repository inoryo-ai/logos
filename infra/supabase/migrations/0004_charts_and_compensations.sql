-- ユーザカルテ (ADR-004 + 病院カルテ方式) と Compensation Registry (ADR-007)

-- ========== charts (病院カルテ方式) ==========
create table charts (
    id          uuid primary key default uuid_generate_v4(),
    tenant_id   uuid not null references tenants(id) on delete cascade,
    user_id     uuid not null,                          -- end user uid
    schema_version int not null default 1,
    -- セクション JSON: {basic, current, recent, history, operator_memo}
    sections    jsonb not null default '{}'::jsonb,
    updated_at  timestamptz not null default now(),
    updated_by  uuid,                                   -- 最終更新者 (NOUS=null, human=uid)
    review_status text not null default 'auto'         -- auto | pending_review | reviewed | rejected
                    check (review_status in ('auto','pending_review','reviewed','rejected')),
    unique (tenant_id, user_id)
);

create index on charts (tenant_id, updated_at desc);
create index on charts (review_status) where review_status = 'pending_review';

-- カルテ更新の履歴 (ChartReviewer で diff を見るため)
create table chart_revisions (
    id          uuid primary key default uuid_generate_v4(),
    chart_id    uuid not null references charts(id) on delete cascade,
    sections_before jsonb not null,
    sections_after  jsonb not null,
    diff_summary text,                                  -- LLM 生成のヒトに読みやすい要約
    changed_by  uuid,
    change_source text not null check (change_source in ('nous','operator','migration')),
    created_at  timestamptz not null default now()
);

create index on chart_revisions (chart_id, created_at desc);

alter table charts enable row level security;
alter table chart_revisions enable row level security;

create policy charts_member_select on charts
    for select using (tenant_id in (select current_tenant_ids()));
create policy charts_service_write on charts
    for all to service_role using (true) with check (true);

create policy chart_rev_member_select on chart_revisions
    for select using (
        chart_id in (select id from charts where tenant_id in (select current_tenant_ids()))
    );
create policy chart_rev_service_write on chart_revisions
    for all to service_role using (true) with check (true);

-- ========== compensations (ADR-007) ==========
create table compensations (
    id                  uuid primary key default uuid_generate_v4(),
    tenant_id           uuid not null references tenants(id) on delete cascade,
    workflow_run_id     text not null,
    step_name           text not null,
    compensation_step   text not null,
    payload             jsonb not null,
    registered_at       timestamptz not null default now(),
    executed_at         timestamptz,
    status              text not null default 'pending'
                        check (status in ('pending','succeeded','failed'))
);

create index on compensations (workflow_run_id, registered_at desc);
create index on compensations (status) where status in ('pending','failed');

alter table compensations enable row level security;
create policy comp_member_select on compensations
    for select using (tenant_id in (select current_tenant_ids()));
create policy comp_service_write on compensations
    for all to service_role using (true) with check (true);
