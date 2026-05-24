# Supabase スキーマ (Logos)

## 適用順

```
0001_tenants_base.sql            -- tenants / tenant_members / RLS ヘルパ
0002_traces.sql                  -- traces / trace_spans
0003_annotation_cache.sql        -- annotation_cache + 類似検索 RPC
0004_charts_and_compensations.sql -- charts / chart_revisions / compensations
```

## 適用方法

### A. Supabase クラウド (本番想定)

```bash
# プロジェクト作成後
supabase link --project-ref <ref>
supabase db push       # migrations フォルダを全適用
```

### B. ローカル開発

```bash
supabase start
psql "$SUPABASE_LOCAL_DB_URL" -f migrations/0001_tenants_base.sql
psql "$SUPABASE_LOCAL_DB_URL" -f migrations/0002_traces.sql
psql "$SUPABASE_LOCAL_DB_URL" -f migrations/0003_annotation_cache.sql
psql "$SUPABASE_LOCAL_DB_URL" -f migrations/0004_charts_and_compensations.sql
```

## RLS の絶対原則 (ADR-004)

- 全テーブルに `tenant_id` 列
- 全テーブルで `enable row level security`
- 全読取ポリシーは `tenant_id in (select current_tenant_ids())`
- 全書込は `service_role` 経由 (Next.js API route から `SUPABASE_SERVICE_ROLE_KEY` で実行)
- ユーザ向け anon key では **書き込みを許可しない** (service_role 専用)

## 拡張機能依存

- `vector` (pgvector): AnnotationCache 用
- `uuid-ossp`: 主キー生成
- `pgcrypto`: 将来 hash 計算用

## マルチテナント侵害テスト (Week 5)

`adversarial/0xx_tenant_isolation.spec.ts` で以下を必ず通すこと:

- A 社の anon クライアントで B 社の charts を SELECT → 0 行
- A 社の operator が B 社の trace を SELECT → 0 行
- AnnotationCache 検索が tenant_id を跨がない
