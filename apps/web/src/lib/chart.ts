// ChartManager facade (病院カルテ方式). Week 3 fills in the real upsert.

export type ChartSections = {
  basic?: Record<string, unknown>;
  current?: Record<string, unknown>;
  recent?: string;
  history?: Record<string, unknown>;
  operatorMemo?: string;
};

export async function upsertChart(args: {
  tenantId: string;
  userId: string;
  recent: string;
}): Promise<ChartSections> {
  // TODO Week 3: hit Supabase, return prior sections so saga can rollback.
  return { recent: args.recent };
}
