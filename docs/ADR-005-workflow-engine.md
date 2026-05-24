# ADR-005: WorkflowEngine 仕様

**Date**: 2026-05-23 (初版)
**Revised**: 2026-05-23 (Vercel Workflow DevKit 採用へ転換)
**Status**: Accepted

## Context

ADR-004 で「業務は YAML ワークフローで定義する」と決めたが、実行エンジンの仕様が空白。
初版では「自作軽量エンジン → Temporal 移行検討」と判断したが、調査の結果 **Vercel Workflow DevKit** が要件をほぼ全部満たす公式プロダクトとして存在することを確認。自作判断を撤回。

## Decision

### 採用方針: **Vercel Workflow DevKit + DurableAgent**

#### 採用理由

1. Vercel ネイティブで Logos のホスティングと完全統合
2. `"use workflow"` / `"use step"` ディレクティブで durable execution
3. retry / sleep / hooks / webhooks / streaming が標準搭載
4. `DurableAgent` クラスが AI SDK と統合済 (我々の ProcessModule 設計に直結)
5. テスト用 Vitest プラグイン (`@workflow/vitest`) で in-process テスト可能
6. 観測ダッシュボード (`npx workflow web`) が即使用可

#### 言語境界の整理

| 層 | 言語 | 役割 |
|---|---|---|
| WorkflowEngine | TypeScript (Vercel Workflow) | オーケストレーション・retry・durable state |
| AI orchestration | TypeScript (DurableAgent + AI SDK) | LLM 呼出・ツール実行・streaming |
| NOUS bridge | Python (FastAPI) | NOUS MCP server との橋渡し |
| Process modules (汎用) | TypeScript step 関数 | 大半のロジック |
| Process modules (NOUS依存) | Python → HTTP 経由で TS step から呼出 | NOUS が必要なものだけ |

→ **API 層は TypeScript 主体に方向修正**。FastAPI は NOUS bridge のみ縮小。

### 主要パターン

#### A. 同期ワークフロー (チャット応答)

```typescript
// app/workflows/chat-respond.ts
import { sleep, fetch } from "workflow";
import { getWritable } from "workflow";
import { DurableAgent } from "@workflow/ai/agent";

async function retrieveKnowledge(query: string, tenantId: string) {
  "use step";
  // Supabase pgvector 検索 + AnnotationCache 確認
  return await searchKB(query, tenantId);
}

async function callNous(prompt: string) {
  "use step";
  // FastAPI 経由で NOUS MCP を叩く
  const r = await fetch("https://logos-api.vercel.app/nous/ask", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
  return r.json();
}

export async function chatRespond(query: string, tenantId: string, userId: string) {
  "use workflow";

  const ctx = await retrieveKnowledge(query, tenantId);
  const agent = new DurableAgent({
    model: "anthropic/claude-haiku-4-5",
    system: "Marketista assistant. Use context only.",
    tools: { callNous: { description: "deep cognitive", execute: callNous } },
  });

  const result = await agent.stream({
    messages: [{ role: "user", content: `${query}\n\nContext:\n${ctx}` }],
    writable: getWritable(),
    maxSteps: 3,
  });
  return result.messages;
}
```

#### B. 非同期ワークフロー (weekly report投稿)

```typescript
// app/workflows/weekly-report.ts
import { sleep, createHook } from "workflow";

async function updateChart(userId: string, summary: string) {
  "use step";
  return await chartManager.update(userId, summary);
}

async function postToChat(message: string, roomId: string) {
  "use step";
  return await chatClient.post(roomId, message);
}

async function waitForOperatorApproval(traceId: string) {
  const hook = createHook<{ approved: boolean; edited?: string }>({
    token: `chart-approval-${traceId}`,
  });
  return await hook;
}

export async function weeklyReport(form: WeeklyForm) {
  "use workflow";

  const summary = await summarize(form.body);
  await updateChart(form.userId, summary);

  // 半年運用期間中: 操作員承認待ち
  const decision = await waitForOperatorApproval(form.traceId);
  const finalSummary = decision.edited ?? summary;

  await postToChat(`${form.userName} weekly report: ${finalSummary}`, form.roomId);
  return { ok: true };
}
```

→ `createHook` が **reviewer承認フロー** に完全フィット。review-loop operationがそのまま実装できる。

#### C. AI Agent としての ProcessModule

ADR-004 で定義した ProcessModule の多くは `DurableAgent` の **tool** として登録する形で実現:

```typescript
const agent = new DurableAgent({
  model: ...,
  tools: {
    intentClassifier: { ... execute: classifyIntent },
    knowledgeRetrieval: { ... execute: searchKB },
    chartUpdater: { ... execute: updateChart },
    validator: { ... execute: validate },
  },
});
```

「ブロック差し込み式」の実装層が DurableAgent のツール登録 = **ADR-004 の理想と完全一致**。

### エラー処理 (DevKit 標準)

```typescript
import { FatalError, RetryableError } from "workflow";

// 4xx 系: retry しない
if (status >= 400 && status < 500) throw new FatalError(`Client ${status}`);
// 429: 指定時間後に retry
if (status === 429) throw new RetryableError("Rate limit", { retryAfter: "5m" });
// 5xx: 自動 retry (バックオフ DevKit 任せ)
if (status >= 500) throw new Error("Server error");
```

### 観測性 (ADR-001 連動)

- DevKit が trace を内部生成 + Vercel ダッシュボード可視化
- Langfuse には step 内部で個別 span を発行 (DurableAgent.stream 内の各 LLM 呼出単位)
- workflow_id = `run.runId`、step_id = step 関数名 を Langfuse span に attach
- `npx workflow web <run_id>` で DevKit 側の詳細も即確認可

### テスト

```typescript
// __tests__/chat-respond.integration.test.ts
import { start, getRun } from "workflow/api";
import { waitForHook } from "@workflow/vitest";

it("weekly report waits for operator approval", async () => {
  const run = await start(weeklyReport, [sampleForm]);
  await waitForHook(run, { token: `chart-approval-${sampleForm.traceId}` });
  await resumeHook(`chart-approval-${sampleForm.traceId}`, { approved: true });
  const result = await run.returnValue;
  expect(result.ok).toBe(true);
});
```

### YAML 定義への対応

ADR-004 の YAML ワークフロー定義は **撤回**。代わりに TypeScript で定義する。
ノーコード組立 UI (Phase 2, Week 18+) を作るときは UI → TypeScript コード生成 という変換層を挟む。

理由:
- DevKit は TypeScript ファースト
- YAML から DevKit 起動への変換層を作るコストが見合わない
- ノーコード UI までは「コードで書いて gitops」で十分

## Consequences

**正の影響**
- 実装コスト大幅減 (自作 → ライブラリ呼出)
- Vercel 公式メンテナンスで保守負担ゼロ
- DurableAgent が ADR-004 のモジュール基盤と完全一致
- hooks がカルテ承認フロー (ADR-003 / 半年運用) に完全フィット
- テスト基盤完備 (`@workflow/vitest`)
- ADR-007 (Outbox + Saga) が大幅簡素化可能 (durable step が retry/persist 自動)

**負の影響**
- TypeScript 主体に方向修正 → Python FastAPI 層が縮小 (NOUS bridge のみ)
- Vercel への依存深化 (ベンダロックイン)
- DevKit のバージョン変化に追従義務
- Python で書きたい複雑 ProcessModule は HTTP 越しになる

### Vercel 依存リスクの緩和

- NOUS は別ホスティング (自前) のままで唯一性保持
- 業務ロジックは TypeScript step として独立 (DevKit に依存するのは「workflow 関数の中」だけ)
- 最悪 DevKit 離脱時は step 関数群を別の orchestrator で再オーケスト可能

## 関連

- ADR-001: Trace-First (DevKit trace + Langfuse 二重記録)
- ADR-004: モジュール基盤 (DurableAgent ツール = ProcessModule)
- ADR-007: Outbox + Saga (DevKit durable step で大半カバー、ADR-007 を簡素化要)
- ADR-008: LLM Fallback (DurableAgent 内で AI Gateway 統合)

## 次アクション (Week 0 残)

1. `apps/web/package.json` に `workflow`, `@workflow/ai`, `@workflow/vitest` 追加
2. `npx workflow health` で疎通確認
3. サンプル workflow を 1 本書いて `npx workflow web` で動作確認
4. ADR-007 を「DevKit + compensating action のみ」に縮小改訂
