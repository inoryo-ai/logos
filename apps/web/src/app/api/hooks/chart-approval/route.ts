import { resumeHook } from "workflow/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { traceId, approved, edited } = await req.json();
  if (!traceId || typeof approved !== "boolean") {
    return Response.json({ error: "missing fields" }, { status: 400 });
  }
  await resumeHook(`chart-approval-${traceId}`, { approved, edited });
  return Response.json({ ok: true });
}
