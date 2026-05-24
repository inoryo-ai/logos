import { start } from "workflow/api";
import { chatRespond } from "@/workflows/chat-respond";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { query, tenantId, userId } = await req.json();
  if (!query || !tenantId || !userId) {
    return Response.json({ error: "missing fields" }, { status: 400 });
  }
  const run = await start(chatRespond, [query, tenantId, userId]);
  return new Response(run.getReadable(), {
    headers: { "Content-Type": "text/event-stream" },
  });
}
