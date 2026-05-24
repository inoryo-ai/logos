// FastAPI bridge to NOUS MCP. Keeps the Python footprint small per ADR-005.

export async function askNous(prompt: string, tenantId: string): Promise<string> {
  const base = process.env.NOUS_BRIDGE_URL ?? "http://localhost:8000";
  const res = await fetch(`${base}/nous/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, tenant_id: tenantId }),
  });
  if (!res.ok) throw new Error(`NOUS bridge ${res.status}`);
  const data = (await res.json()) as { answer: string };
  return data.answer;
}
