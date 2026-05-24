import { createClient } from "@supabase/supabase-js";

const supabase = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

export type CacheHit = {
  id: string;
  canonical_answer: string;
  canonical_metadata: Record<string, unknown>;
  similarity: number;
};

export async function searchAnnotationCache(args: {
  tenantId: string;
  workflowName: string;
  query: string;
  threshold?: number;
}): Promise<CacheHit | null> {
  const embedding = await embed(args.query);
  const { data, error } = await supabase().rpc("search_annotation_cache", {
    p_tenant_id: args.tenantId,
    p_workflow_name: args.workflowName,
    p_query_embedding: embedding,
    p_threshold: args.threshold ?? 0.92,
    p_limit: 1,
  });
  if (error) throw error;
  return (data?.[0] as CacheHit | undefined) ?? null;
}

export async function recordCacheHit(id: string) {
  await supabase()
    .from("annotation_cache")
    .update({ hit_count: { increment: 1 } as never, last_hit_at: new Date().toISOString() })
    .eq("id", id);
}

async function embed(_text: string): Promise<number[]> {
  // TODO Week 2: replace with text-embedding-3-small via AI Gateway.
  throw new Error("embed() not yet wired — Week 2 task #21");
}
