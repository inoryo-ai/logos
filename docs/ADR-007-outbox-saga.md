# ADR-007: Saga / Compensation (分散整合性)

**Date**: 2026-05-23 (初版)
**Revised**: 2026-05-23 (ADR-005 で Vercel Workflow DevKit 採用に伴い縮小)
**Status**: Accepted (Revised)

## ⚠ 改訂サマリ

初版では「Outbox Pattern + Saga」両方を採用予定だったが、ADR-005 の DevKit 採用により:
- **retry / durable step / 失敗時の永続化** は DevKit が自動対応 → Outbox 不要
- **補償アクション (Saga / Compensation)** は依然として明示的に書く必要あり → 縮小版を採用

縮小版は **「Saga / Compensation Registry」のみ** に絞る。

## Context

ADR-004 のワークフローは複数の外部依存 (Supabase / chat adapter / WP / LINE / OpenAI / NOUS) を 1 つの業務処理内で連携させる。
ADR-002 の fail-soft は **単一リクエスト内** の validation 失敗を扱うだけで、**複数ステップにまたがる外部書込の整合性** は未定義。

典型シナリオ:
1. end userがweekly reportをフォーム送信
2. → カルテ更新 ✅
3. → AdviceGenerator (LLM) ✅
4. → chat adapter 投稿 ❌ (chat adapter API 一時障害)
5. → end userに応答返却 (上記 3 が成功したと誤って通知)

→ カルテと履歴は進んでいるのに chat adapter に投稿されていない不整合が発生。

## Decision (改訂版)

**Vercel Workflow DevKit の durable step + 補償レジストリ** で分散整合性を担保する。

### 役割分担

| 整合性パターン | 担当 |
|---|---|
| step retry (一時障害) | DevKit 自動 (RetryableError) |
| step 永続化・再実行 | DevKit 自動 ("use step") |
| ワークフロー中断・再開 | DevKit 自動 (hooks) |
| **補償アクション (Saga)** | **本 ADR で定義する Compensation Registry** |
| 重複防止 (idempotency) | 各 step 内で idempotency_key を持つ |

### Compensation Registry

各 step に「補償用 step」をペアで登録:

```typescript
import { registerCompensation } from "@logos/saga";

async function postChat(message: string, roomId: string) {
  "use step";
  const res = await chatClient.post(roomId, message);
  registerCompensation("postChat", { postId: res.id, roomId });
  return res;
}

// 補償 step (同 ADR 内に併記)
async function compensatePostChat(args: { postId: string; roomId: string }) {
  "use step";
  await chatClient.delete(args.roomId, args.postId);
}
```

### ワークフロー失敗時の動作

```typescript
import { runCompensations } from "@logos/saga";

export async function weeklyReport(form: WeeklyForm) {
  "use workflow";
  try {
    await updateChart(form.userId, form.summary);
    await postChat(`weekly report: ${form.summary}`, form.roomId);
    await notifyStudent(form.userId, form.summary);
    return { ok: true };
  } catch (err) {
    if (err instanceof FatalError) {
      // 完了済み step を逆順に補償
      await runCompensations();
      throw err;
    }
    throw err;  // RetryableError は DevKit が retry
  }
}
```

### Compensation Registry テーブル (永続化)

```sql
CREATE TABLE compensations (
    id uuid PRIMARY KEY,
    tenant_id uuid NOT NULL,
    workflow_run_id text NOT NULL,
    step_name text NOT NULL,
    compensation_step text NOT NULL,    -- 補償用 step 関数名
    payload jsonb NOT NULL,             -- 補償時に渡す引数
    registered_at timestamptz NOT NULL DEFAULT now(),
    executed_at timestamptz,
    status text NOT NULL DEFAULT 'pending'  -- pending | succeeded | failed
);

CREATE INDEX ON compensations (workflow_run_id, registered_at DESC);
```

### 補償実行ロジック

`runCompensations()` は:
1. 現 workflow_run_id の `status='pending'` 補償を **登録逆順** で取得
2. 各補償 step を `start()` で fire-and-forget (失敗しても次に進む)
3. 各補償の成否を `compensations.status` に記録
4. 全部成功 → workflow `status='compensated'`
5. 1 つでも失敗 → `status='partial_compensation'` + Slack アラート (人手介入)

### Idempotency

各 step 内で idempotency_key を持つ:
- chat adapter: `payload.idempotency_key = sha256(trace_id + step_name)`
- WP: API 側に重複防止フィールドを設定 (or our side で先に存在確認)

### 同期返却が必要な操作

チャット応答など即時返却操作は補償不要 (失敗時にユーザへ即エラー)。
Compensation Registry の対象は **「成功したらユーザ起点では巻き戻せない外部書込」のみ**:
- chat adapter 投稿
- WP 会員情報変更
- 外部 LINE 通知
- メール送信 (送信済みは取り消し不可だが、フォローメールは送れる)

### 観測性 (ADR-001 連動)

- 各 compensation row は trace_id 経由で Langfuse span と紐付け
- Vercel Workflow ダッシュボード (`npx workflow web`) で workflow 全体可視化
- `status='failed'` または `status='partial_compensation'` で Slack アラート

## Consequences

**正の影響**
- DevKit が retry/persist を担当することで実装量が大幅減
- 補償が必要な操作だけに Compensation Registry を絞れる
- 半人手介入 (partial_compensation 時) の道筋が明確

**負の影響**
- Compensation Registry テーブルの cleanup 必要 (月 1 回 30 日経過行削除)
- 補償 step を「外部副作用ある step」と必ずペアで書く規約遵守
- 補償自体が失敗した場合の最終手段は人手 (これは原理的に避けられない)

## 関連

- ADR-001: Trace-First (compensation row も trace 紐付け)
- ADR-005: WorkflowEngine (DevKit durable step が retry を担う)
- ADR-006: Migration (移行中の整合性検証も同じ枠組み)
