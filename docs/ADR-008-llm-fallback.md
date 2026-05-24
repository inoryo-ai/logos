# ADR-008: LLM Fallback (NOUS 単一障害点対策)

**Date**: 2026-05-23
**Status**: Accepted

## Context

Logos の ProcessModule の多くは NOUS MCP server を呼び出す。
現状 NOUS は **singleton Brain (単一プロセス)** で動作し、以下のリスクがある:
- NOUS server が落ちたら全テナント停止
- NOUS のメンテナンス時に全停止
- NOUS のバージョン互換性問題で全停止

業務効率化基盤として SLA を提供するなら単一障害点は許容できない。

## Decision

**3 段 fallback ストラテジ** を採用:

```
[Primary] NOUS MCP → 失敗
   ↓
[Secondary] Vercel AI Gateway → OpenAI gpt-4.1-nano → 失敗
   ↓
[Tertiary] Anthropic claude-haiku-4-5 直叩き → 失敗
   ↓
[Final] AnnotationCache の近似マッチ (cosine > 0.85) → 失敗
   ↓
[Last Resort] 「ただいま応答できません」固定文 + 人手対応キューに登録
```

### Provider 抽象化

```python
class LLMProvider(BaseModule):
    name: str
    priority: int        # 0 = primary
    cost_per_1k_tokens: float
    avg_latency_ms: int

    async def ask(self, trace: TraceContext, prompt: str, **kwargs) -> str: ...
    async def healthcheck(self) -> dict: ...

class LLMRouter:
    providers: list[LLMProvider]  # priority 順

    async def ask(self, trace, prompt, **kwargs) -> str:
        for provider in self.providers:
            if not await self._is_healthy(provider):
                continue
            try:
                return await provider.ask(trace, prompt, **kwargs)
            except UpstreamError as e:
                trace.log("provider_failed", provider.name, str(e))
                self._mark_unhealthy(provider, ttl=60)
                continue
        return self._last_resort(trace, prompt)
```

### Healthcheck の仕組み

各 provider に `/healthz` 相当を持たせ、`LLMRouter` が以下のタイミングで状態更新:

- 30 秒ごとの定期 healthcheck
- リクエスト失敗時に即 unhealthy マーク (TTL 60 秒)
- 連続成功 3 回で healthy 復帰

unhealthy 中の provider は skip され、TTL 経過後に再評価。

### 切替判定の閾値

| 条件 | 切替動作 |
|---|---|
| HTTP 5xx / connection refused | 即 secondary へ |
| timeout (10秒) | 即 secondary へ |
| HTTP 429 (rate limit) | retry 1 回 → secondary へ |
| 4xx 系 (請求停止等) | 即 secondary へ |
| 応答が空 / null | 即 secondary へ |

### 観測性 (Langfuse 連動)

- 各リクエストの provider chain を span attribute に記録
- どの provider で成功したかが trace から即特定可能
- provider 別の成功率・レイテンシ・コストを日次ダッシュボード化

### コスト面の考慮

| Provider | 1k token あたりコスト (input/output) | 用途 |
|---|---|---|
| NOUS (自社) | 0 円 | Primary, ベースライン |
| GPT-4.1 nano | 0.06 / 0.24 円 | Secondary, NOUS 不可時 |
| Claude Haiku 4.5 | 0.15 / 0.75 円 | Tertiary, 上記 2 つ不可時 |

NOUS が常時稼働している通常時のコストは変わらない。fallback 発動時のみ追加コスト発生。

### 機能差分の吸収

NOUS 固有機能 (BookShelf 検索 / Hippocampus エピソード) は fallback では使えない。
fallback 時は「knowledge-only mode」に degrade:
- BookShelf 検索の代わりに pgvector で annotation を検索
- Hippocampus の代わりに直近会話 5 件を context に注入
- 応答品質は若干落ちるが「応答が返らない」よりはマシ

### NOUS 障害時の通知

- 1 リクエストでも fallback 発動 → Slack 通知
- 5 分以内に 10 リクエスト fallback → Slack alert (NOUS 異常確定)
- 1 時間以上 NOUS 不可 → 人手介入アラート

## Consequences

**正の影響**
- NOUS down でも基盤継続稼働
- メンテナンス時のサービス無停止が可能
- 段階的 degradation で「全停止」が起きない

**負の影響**
- 実装複雑度上昇 (provider 抽象 + healthcheck + 切替ロジック)
- fallback 発動時のコスト管理
- 機能差分の説明責任 (テナント側に「NOUS down 中は応答品質が一部下がる」を明示)

## 関連

- ADR-001: Trace-First (provider chain を span 記録)
- ADR-002: fail-soft (LLM fallback も fail-soft の一種)
- ADR-003: AnnotationCache (last resort の前段で活用)
- ADR-004: モジュール基盤 (LLMProvider も BaseModule)
