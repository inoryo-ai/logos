// ADR-004 BaseModule interface.
// All modules implement the same 4-method contract so the platform can
// orchestrate / replay / observe them uniformly.

import type { TraceContext } from "./trace";

export type HealthStatus = "ok" | "degraded" | "down";

export type MetricSample = {
  name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
};

export interface BaseModule<Input, Output> {
  readonly name: string;
  readonly version: string;
  process(trace: TraceContext, input: Input): Promise<Output>;
  replay(trace: TraceContext, input: Input): Promise<Output>;
  healthcheck(): Promise<{ status: HealthStatus; details?: unknown }>;
  metrics(): Promise<MetricSample[]>;
}

export abstract class AbstractModule<Input, Output> implements BaseModule<Input, Output> {
  abstract readonly name: string;
  abstract readonly version: string;
  abstract process(trace: TraceContext, input: Input): Promise<Output>;

  async replay(trace: TraceContext, input: Input): Promise<Output> {
    return this.process(trace, input);
  }
  async healthcheck() {
    return { status: "ok" as const };
  }
  async metrics(): Promise<MetricSample[]> {
    return [];
  }
}
