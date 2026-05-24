// ADR-002 fail-soft validation.
// Returns per-check outcomes instead of an all-or-nothing pass/fail.

export type Severity = "info" | "warn" | "block";

export type CheckOutcome = {
  checkId: string;
  passed: boolean;
  severity: Severity;
  patternMatched?: string;
  autoFixApplied: boolean;
  message?: string;
};

export type ValidationResult<T> = {
  passed: boolean;                  // true iff no severity='block' check failed
  checks: CheckOutcome[];
  annotatedOutput: T;
};

export function aggregate<T>(annotatedOutput: T, checks: CheckOutcome[]): ValidationResult<T> {
  const passed = !checks.some((c) => !c.passed && c.severity === "block");
  return { passed, checks, annotatedOutput };
}
