# ADR-004: モジュール差し込み型アーキテクチャ

**Date**: 2026-05-23
**Status**: Accepted (オーナー承認)

## Context

当初「対話プラットフォーム」として設計を進めていたが、以下の理由でスコープを「業務効率化モジュール基盤」へ拡張する判断:

1. Tenant A (Tenant) もreport module projectも本質は「業務効率化」であり、チャットUIはその表現の 1 つに過ぎない
2. v02-test で既に Agent + Team + Commander + Adapter の差込型構造が実証済み
3. Zapier / Make / n8n + Dify の総取りで日本中小企業向けに刺さる空白市場がある
4. 助成金 (IPA 未踏アドバンスト等) の応募テーマとしてチャットボットより遥かに通る

## Decision

Logos を **「業務のレゴブロック」基盤** として設計する。4 種類のブロックを差し込み式で組み合わせる。

### 4 ブロック分類

| 種別 | 役割 | 既存資産 |
|---|---|---|
| 🟦 InputModule | 入力受付 (Form / Chat / Webhook / Email / API / Voice) | Adapter (Quiz, Feedback) |
| 🟨 ProcessModule | 処理 (Classifier / Retrieval / Summarizer / Generator / Validator / NOUS) | Agent (Response/Knowledge/Guardrail/Summary) |
| 🟩 DataModule | 保存・読出 (Chart / KnowledgeBase / History / Profile) | BookShelf + ChartManager |
| 🟧 OutputModule | 出力 (Chat / Email / LINE / chat adapter / WP / Slack / Dashboard / Report) | Adapter (Notify, SNS, WordPress) |

### 共通契約

全ブロックは BaseModule (ADR-001) を継承:
- `async process(trace, payload) -> dict`
- `async replay(trace_id) -> dict`
- `async healthcheck() -> dict`
- `metrics() -> dict`

加えてブロック種別ごとの追加 interface:

```python
class InputModule(BaseModule):
    async def listen(self) -> AsyncIterator[Event]: ...

class ProcessModule(BaseModule):
    declared_inputs: list[str]   # 受け取れるデータ型
    declared_outputs: list[str]  # 出力するデータ型

class DataModule(BaseModule):
    async def read(self, key, tenant_id) -> dict: ...
    async def write(self, key, value, tenant_id) -> None: ...

class OutputModule(BaseModule):
    async def emit(self, payload) -> dict: ...
```

### ワークフロー定義 (YAML)

各業務は「入力 → 処理 → ... → 出力」のルートを YAML で定義:

```yaml
workflow_id: weekly_report_v1
tenant_id: markenista
trigger:
  type: form_submit
  form: weekly_report_form
steps:
  - input: form.weekly_report_form
  - process: summarizer.weekly
    inputs: [form.body]
  - process: chart_updater
    inputs: [user_id, summary]
  - process: advice_generator
    inputs: [chart, summary]
  - output: chatAdapter.post
    channel: instructor
    payload: [summary]
  - output: chat.respond_to_user
    payload: [advice]
```

### 例: 既存・将来案件のワークフロー

| 案件 | 入力 | 処理 | データ | 出力 |
|---|---|---|---|---|
| Tenant | Chat | Intent + Retrieval + Generator + Validator | Chart + KB | Chat |
| weekly report | Form | Summarizer + Chart更新 + AdviceGen | Chart + History | chat adapter + Chat |
| 病院予約 | LINE | 予約整理 + 重複検知 | Chart + Schedule | LINE + Dashboard |
| 美容室 | 予約Form | 顧客カルテ更新 + 売上記録 | Chart + Sales | LINE + Dashboard + Report |

## Consequences

**正の影響**
- 1 つの基盤で複数業種の業務効率化案件に対応可能
- マルチテナント (ADR は維持) で複数顧客を 1 インスタンスに同居
- 助成金応募の通り率向上
- Zapier / Dify の競合領域に直接入れる
- パッケージ単価上昇 (Starter 3万 / Standard 8万 / Pro 20万 / Enterprise 50万〜)

**負の影響**
- ロードマップが +4 週延長 (10週 → 14週)
- ノーコードワークフロー組立 UI が必要 (Week 11-14 で実装)
- モジュール契約の安定化が重要 (将来の SDK 公開を見据える)

**スコープ調整**
- Week 1-10: 当初予定通り (Tenant + weekly reportを hardcoded ワークフローで稼働)
- Week 11-14: ノーコード組立 UI 実装 + Tenant A advice 化
- Week 15+: 第 3 案件営業 + モジュール SDK 公開検討

## 関連

- ADR-001: Trace-First (全ブロックが TraceContext を受け取る)
- ADR-002: fail-soft validation
- ADR-003: AnnotationCache
