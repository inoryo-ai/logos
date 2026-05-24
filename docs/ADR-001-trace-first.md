# ADR-001: Trace-First Design

**Date**: 2026-05-23
**Status**: Accepted

## Context

Tenant A 本番で debug が地獄化した根本原因:
1. リクエスト境界をまたいだ追跡手段が無い (printlog のみ)
2. fallback が all-or-nothing で「どのチェックで落ちたか」が消失
3. 失敗したリクエストを再現する手段が無い

## Decision

全モジュールで `TraceContext` を必須引数とし、Langfuse へ自動送出する。

```python
class TraceContext:
    trace_id: str          # UUIDv7 (時系列順)
    tenant_id: str
    parent_span_id: str | None
    started_at: datetime
    metadata: dict
```

全 BaseModule.process() の最初の引数は `TraceContext`。
全 LLM 呼び出しは Langfuse span 内で実行。
trace_id は HTTP レスポンスヘッダ `X-Trace-Id` で外部に返す。

## Consequences

**正の影響**
- 任意のユーザ報告 (trace_id) → 完全再現が可能
- per-module レイテンシ/コストが自動可視化
- annotation 添削画面で trace_id ベースに即遷移

**負の影響**
- 全モジュールが TraceContext を受け取る必要 (interface 強制)
- Langfuse self-host インフラ管理コスト (月 ~500円)

## 関連

- ADR-002: fail-soft validation
- ADR-003: AnnotationCache priority
