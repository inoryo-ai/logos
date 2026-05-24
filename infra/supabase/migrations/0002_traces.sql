-- Logos Trace ストア (ADR-001 Trace-First)
-- Langfuse とは別に「業務的 trace」を Postgres に持つ。Langfuse は観測 UI 用、こちらは
-- ワークフロー再生 / カスタム検索 / 監査用の正本。

create table traces (
    id              uuid primary key,                  -- UUIDv7 推奨 (時系列順)
    tenant_id       uuid not null references tenants(id) on delete cascade,
    workflow_name   text not null,                     -- "chat_respond" / "weekly_report" 等
    workflow_run_id text,                              -- DevKit の run.runId
    user_id         uuid,                              -- end user (Supabase Auth uid)
    started_at      timestamptz not null default now(),
    ended_at        timestamptz,
    status          text not null default 'running'    -- running | succeeded | failed | compensated | partial_compensation
                    check (status in ('running','succeeded','failed','compensated','partial_compensation')),
    metadata        jsonb not null default '{}'::jsonb
);

create index on traces (tenant_id, started_at desc);
create index on traces (workflow_run_id);
create index on traces (status) where status in ('failed','partial_compensation');

create table trace_spans (
    id           uuid primary key default uuid_generate_v4(),
    trace_id     uuid not null references traces(id) on delete cascade,
    parent_span_id uuid references trace_spans(id),
    module_name  text not null,                        -- "IntentClassifier" / "Validator" 等
    started_at   timestamptz not null default now(),
    ended_at     timestamptz,
    input        jsonb,
    output       jsonb,
    error        jsonb,
    metadata     jsonb not null default '{}'::jsonb
);

create index on trace_spans (trace_id, started_at);

-- RLS
alter table traces enable row level security;
alter table trace_spans enable row level security;

create policy traces_member_select on traces
    for select using (tenant_id in (select current_tenant_ids()));
create policy traces_service_write on traces
    for all to service_role using (true) with check (true);

create policy trace_spans_member_select on trace_spans
    for select using (
        trace_id in (select id from traces where tenant_id in (select current_tenant_ids()))
    );
create policy trace_spans_service_write on trace_spans
    for all to service_role using (true) with check (true);
