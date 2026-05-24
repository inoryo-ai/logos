import { DurableAgent } from "@workflow/ai/agent";
import { getWritable } from "workflow";
import { z } from "zod";
import { stepCountIs, type UIMessageChunk } from "ai";

import { searchAnnotationCache, recordCacheHit } from "@/lib/annotation-cache";
import { retrieveKnowledge } from "@/lib/knowledge";
import { askNous } from "@/lib/nous-bridge";

async function tryCache(tenantId: string, workflowName: string, query: string) {
  "use step";
  const hit = await searchAnnotationCache({ tenantId, workflowName, query });
  if (hit) {
    await recordCacheHit(hit.id);
  }
  return hit;
}

async function fetchContext(tenantId: string, query: string) {
  "use step";
  return retrieveKnowledge({ tenantId, query, topK: 8 });
}

async function callNous(args: { prompt: string; tenantId: string }) {
  "use step";
  return askNous(args.prompt, args.tenantId);
}

export async function chatRespond(query: string, tenantId: string, userId: string) {
  "use workflow";

  const cached = await tryCache(tenantId, "chat_respond", query);
  if (cached) {
    return { source: "cache", answer: cached.canonical_answer } as const;
  }

  const ctx = await fetchContext(tenantId, query);

  const agent = new DurableAgent({
    model: "anthropic/claude-sonnet-4.6",
    system: [
      "You are the Marketista assistant.",
      "Cite only from the provided context. If unknown, say so explicitly.",
      `tenantId=${tenantId} userId=${userId}`,
    ].join("\n"),
    tools: {
      askNous: {
        description: "Deep cognitive query via NOUS",
        inputSchema: z.object({ prompt: z.string() }),
        execute: (args) => callNous({ prompt: args.prompt, tenantId }),
      },
    },
  });

  const result = await agent.stream({
    messages: [{ role: "user", content: `${query}\n\n# Context\n${ctx}` }],
    writable: getWritable<UIMessageChunk>(),
    stopWhen: stepCountIs(3),
  });

  return { source: "llm", messages: result.messages } as const;
}
