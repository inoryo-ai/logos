// ADR-007 Compensation Registry — TS facade.
// Real implementation (Week 4) persists rows in the `compensations` table and
// runs them in reverse-registration order on workflow failure.

type CompensationName = "updateChart" | "postChat";

type Entry = { name: CompensationName; payload: unknown };

const queue: Entry[] = [];

export function registerCompensation(name: CompensationName, payload: unknown) {
  queue.push({ name, payload });
}

export async function runCompensations() {
  while (queue.length) {
    const entry = queue.pop()!;
    try {
      await dispatch(entry);
    } catch {
      // Week 4: write status='failed' to compensations table + Slack alert.
    }
  }
}

async function dispatch(_entry: Entry) {
  // Week 4 wires per-name handlers.
}
