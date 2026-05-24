import { createHook } from "workflow";

import { summarizeWeeklyReport } from "@/lib/summarize";
import { upsertChart } from "@/lib/chart";
import { postChat } from "@/lib/chat-adapter";
import { registerCompensation, runCompensations } from "@/lib/saga";

export type WeeklyForm = {
  tenantId: string;
  userId: string;
  userName: string;
  roomId: string;
  traceId: string;
  body: { wins: string; pains: string; nextGoals: string };
};

async function stepSummarize(body: WeeklyForm["body"]) {
  "use step";
  return summarizeWeeklyReport(body);
}

async function stepUpdateChart(tenantId: string, userId: string, summary: string) {
  "use step";
  const prev = await upsertChart({ tenantId, userId, recent: summary });
  registerCompensation("updateChart", { tenantId, userId, snapshot: prev });
  return summary;
}

async function stepPostChat(roomId: string, message: string, idempotencyKey: string) {
  "use step";
  const res = await postChat({ roomId, message, idempotencyKey });
  registerCompensation("postChat", { roomId, postId: res.postId });
  return res;
}

async function waitForOperatorApproval(traceId: string) {
  const hook = createHook<{ approved: boolean; edited?: string }>({
    token: `chart-approval-${traceId}`,
  });
  return await hook;
}

export async function weeklyReport(form: WeeklyForm) {
  "use workflow";

  try {
    const summary = await stepSummarize(form.body);
    const finalSummary = await stepUpdateChart(form.tenantId, form.userId, summary);

    const decision = await waitForOperatorApproval(form.traceId);
    const message = `${form.userName} weekly report\n${decision.edited ?? finalSummary}`;

    await stepPostChat(form.roomId, message, `${form.traceId}:post`);

    return { ok: true } as const;
  } catch (err) {
    await runCompensations();
    throw err;
  }
}
