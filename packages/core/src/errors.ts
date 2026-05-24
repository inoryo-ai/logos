export class LogosError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, message: string, opts: { retryable?: boolean } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.retryable = opts.retryable ?? false;
  }
}

export class ValidationError extends LogosError {
  constructor(message: string, public readonly checks: unknown[]) {
    super("validation_failed", message);
  }
}

export class UpstreamError extends LogosError {
  constructor(public readonly provider: string, message: string, retryable = true) {
    super("upstream_failed", message, { retryable });
  }
}

export class TenantViolationError extends LogosError {
  constructor(message: string) {
    super("tenant_violation", message);
  }
}
