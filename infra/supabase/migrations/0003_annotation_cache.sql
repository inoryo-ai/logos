-- ADR-003 AnnotationCache
-- 人手添削済み回答を pgvector cosine > 0.92 でヒット時に LLM 不経由で即返却。

create table annotation_cache (
    id                uuid primary key default uuid_generate_v4(),
    tenant_id         uuid not null references tenants(id) on delete cascade,
    workflow_name     text not null,                          -- どのワークフローの応答か
    query_text        text not null,
    query_embedding   vector(1536) not null,                  -- text-embedding-3-small
    canonical_answer  text not null,                          -- reviewerが確定した最終応答
    canonical_metadata jsonb not null default '{}'::jsonb,    -- 追加属性 (引用URL/カテゴリ等)
    hit_count         integer not null default 0,
    last_hit_at       timestamptz,
    annotated_by      uuid,                                   -- reviewer user_id
    annotated_at      timestamptz not null default now(),
    superseded_by     uuid references annotation_cache(id),   -- 改訂時の差替先 (null = 有効)
    created_at        timestamptz not null default now()
);

-- pgvector IVFFlat index (cosine)
create index annotation_cache_emb_idx
    on annotation_cache using ivfflat (query_embedding vector_cosine_ops)
    with (lists = 100);

create index on annotation_cache (tenant_id, workflow_name) where superseded_by is null;

-- RLS
alter table annotation_cache enable row level security;
create policy ac_member_select on annotation_cache
    for select using (tenant_id in (select current_tenant_ids()));
create policy ac_service_write on annotation_cache
    for all to service_role using (true) with check (true);

-- ヘルパ関数: 類似検索
create or replace function public.search_annotation_cache(
    p_tenant_id uuid,
    p_workflow_name text,
    p_query_embedding vector(1536),
    p_threshold float default 0.92,
    p_limit int default 1
)
returns table (
    id uuid,
    canonical_answer text,
    canonical_metadata jsonb,
    similarity float
)
language sql
stable
as $$
    select ac.id,
           ac.canonical_answer,
           ac.canonical_metadata,
           1 - (ac.query_embedding <=> p_query_embedding) as similarity
    from annotation_cache ac
    where ac.tenant_id = p_tenant_id
      and ac.workflow_name = p_workflow_name
      and ac.superseded_by is null
      and 1 - (ac.query_embedding <=> p_query_embedding) >= p_threshold
    order by ac.query_embedding <=> p_query_embedding
    limit p_limit;
$$;
