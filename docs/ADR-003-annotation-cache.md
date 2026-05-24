# ADR-003: AnnotationCache (ゆらぎ抑制の中核)

**Date**: 2026-05-23
**Status**: Accepted

## Context

ChatGPT (および LLM 一般) は同一入力に対しても出力にゆらぎがある。
Tenant A / weekly reportの両ユースケースで主要クエリの 60-80% は **反復的な質問** (FAQ パターン) で、毎回 LLM 推論すると:
1. 回答品質がゆらぐ (ユーザ信頼が低下)
2. レイテンシが LLM API 依存 (200-800ms)
3. コストが反復クエリ分だけ膨らむ

Dify の Annotation Reply はこの問題を「人手添削済み回答の意味類似度ヒット → 即時返却」で解決している。

## Decision

3 段の cache 階層を採用:

```
入力テキスト
   ↓
[1] AnnotationCache (人手添削)  ─ hit → 添削済み回答を即返却 (LLM 不経由)
   ↓ miss
[2] DeterministicCache (temp=0 + hash)  ─ hit → 過去 LLM 出力を返却
   ↓ miss
[3] LLM 推論 (temp=0)  → 出力を [2] に記録
```

### AnnotationCache データモデル

```sql
CREATE TABLE annotations (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    query_text text NOT NULL,
    query_embedding vector(1536) NOT NULL,
    canonical_answer text NOT NULL,
    confidence float NOT NULL,         -- reviewer自己評価
    hit_count int DEFAULT 0,
    last_hit_at timestamptz,
    created_by uuid NOT NULL,
    created_at timestamptz DEFAULT now(),
    superseded_by uuid REFERENCES annotations(id),
    status text DEFAULT 'active'       -- active | retired | draft
);

CREATE INDEX ON annotations USING ivfflat (query_embedding vector_cosine_ops);
```

### マッチング

- pgvector cosine 類似度 > **0.92** で hit (要 tuning)
- tenant_id でフィルタ (cross-tenant 漏洩防止)
- status='active' のみ対象
- hit したら `hit_count++`, `last_hit_at = now()`

### reviewer画面 (Week 3 で最小実装)

- trace_id から trace 詳細 → 「この応答を添削して登録」ボタン
- 過去応答に対する修正版を annotation として保存
- 類似 annotation の検出 (重複防止)

### temp=0 + hash cache

- DB に書かず Redis or 等価の KV (1 日 TTL)
- key = `sha256(model_id || normalized_prompt || system_prompt_version)`

## Consequences

**正の影響**
- 主要クエリは LLM 不経由 (レイテンシ ~10ms, コスト 0)
- ゆらぎが構造的に消える (cache hit = 文字通り同じ文字列)
- reviewerが「品質を直接編集」できる (人手介入の正規パス化)

**負の影響**
- pgvector 必須 (Supabase で OK)
- 類似度閾値の tuning が必要 (Week 5 の比較検証で最終調整)
- annotation の腐敗管理 (古い canonical_answer の retire フロー必要)

## 関連

- ADR-001: Trace-First (cache hit/miss は trace に記録)
- ADR-002: fail-soft (warn 付き応答は cache 対象外)
