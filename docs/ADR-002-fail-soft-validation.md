# ADR-002: fail-soft Validation

**Date**: 2026-05-23
**Status**: Accepted

## Context

Tenant A 現本番の `sanitize_hallucinations()` (markenista_assistant.py:329) は all-or-nothing 設計:
- 60+ パターンのいずれか 1 つでもヒット → 応答全体をフォールバックに置換
- 「どのパターンで落ちたか」が呼び出し側に伝わらない
- 1 キーワードの誤検知で正常応答が全削除される事故が複数回発生

## Decision

検証は per-check の flag 集合として表現し、severity に応じて degrade する。

```python
class ValidationResult:
    passed: bool                # 全 critical チェック PASS
    checks: dict[str, CheckOutcome]
    severity: Literal["ok", "warn", "block"]
    annotated_output: str       # 軽微違反は注釈付き返却、blocking は fallback

class CheckOutcome:
    check_id: str               # 例: "hallu.brand_name_mismatch"
    severity: Literal["info", "warn", "block"]
    pattern_matched: str | None
    message: str
    auto_fix_applied: bool
```

**ルール**:
- `block` レベルが 1 つでもあれば fallback
- `warn` 多数 → 注釈を付けて返却 (reviewerが annotation 画面で修正可能)
- すべての outcome を Langfuse の span attribute に記録
- patterns は YAML 化し `data/validators/` で版管理 (コード混入禁止)

## Consequences

**正の影響**
- 軽微誤検知が即事故にならない
- 「どこで落ちたか」がreviewerに見える
- パターン誤りの検出と修正が PR レビューで可能 (YAML 差分)

**負の影響**
- check ID の命名規約が必要
- annotation 画面が必須 (Week 3 内に最小版)

## 関連

- ADR-001: Trace-First (全 outcome は trace span に紐づく)
- ADR-003: AnnotationCache (warn 注釈付き応答は cache 対象外)
