// ADR-001 Trace-First
// Every module call MUST receive a TraceContext as its first argument.

export type TraceContext = {
  traceId: string;            // UUIDv7
  tenantId: string;
  parentSpanId?: string;
  startedAt: string;          // ISO8601
  metadata: Record<string, unknown>;
};

export function newTrace(input: {
  tenantId: string;
  workflowName: string;
  userId?: string;
  parentSpanId?: string;
}): TraceContext {
  return {
    traceId: uuidv7(),
    tenantId: input.tenantId,
    parentSpanId: input.parentSpanId,
    startedAt: new Date().toISOString(),
    metadata: { workflowName: input.workflowName, userId: input.userId },
  };
}

export function childSpan(parent: TraceContext, moduleName: string): TraceContext {
  return {
    ...parent,
    parentSpanId: parent.traceId,
    metadata: { ...parent.metadata, moduleName },
  };
}

// UUIDv7 minimal implementation (time-ordered).
function uuidv7(): string {
  const unix = BigInt(Date.now());
  const rand = crypto.getRandomValues(new Uint8Array(10));
  const hex = (n: bigint, len: number) => n.toString(16).padStart(len, "0");
  const tsHex = hex(unix, 12);
  const ver = "7" + bytesHex(rand.slice(0, 1)).slice(1);
  const variant = ((rand[1]! & 0x3f) | 0x80).toString(16).padStart(2, "0") + bytesHex(rand.slice(2, 3));
  return [
    tsHex.slice(0, 8),
    tsHex.slice(8, 12),
    ver + bytesHex(rand.slice(1, 2)).slice(0, 2),
    variant,
    bytesHex(rand.slice(3, 10)),
  ].join("-").slice(0, 36);
}

function bytesHex(b: Uint8Array): string {
  let s = "";
  for (const n of b) s += n.toString(16).padStart(2, "0");
  return s;
}
