# Logos

**A multi-tenant business workflow platform built around three production-grade primitives: full request tracing, fail-soft validation, and an annotation cache that stabilizes LLM output.**

Most "build your own AI workflow" platforms hit the same three walls in production: untraceable failures across a multi-step pipeline, brittle all-or-nothing validation, and LLM output that drifts every time the model is updated. Logos is designed from the start around those three problems — every request carries a trace, every validation step degrades gracefully, and hand-reviewed answers are reused via embedding similarity to suppress drift.

This is a sanitized public version of the platform's design and reference implementation.

---

## Why this exists

Building a single AI feature is easy. Building a platform that ships dozens of AI workflows across multiple tenants — with SLA, audit, and per-tenant data isolation — is a different problem entirely. Logos is the foundation for that: a shared workflow engine + observability + tenant isolation layer that individual business modules plug into.

The platform is designed for a B2B SaaS context where:

- **A failed request must be debuggable end-to-end** — not just "something went wrong in step 4"
- **An LLM that returns slightly worse output today than yesterday must not break customer trust** — hence annotation cache + fail-soft validation
- **Each tenant's data must be isolated at the database layer**, not just the application layer

---

## Architecture

```
                  ┌──────────────────────────────────────┐
                  │  apps/web  (Next.js 15, App Router)  │
                  │   admin UI · embedded chat · auth    │
                  └──────────────────┬───────────────────┘
                                     │
                                     ▼
                  ┌──────────────────────────────────────┐
                  │  Vercel Workflow DevKit              │
                  │  ("use workflow" / "use step")       │
                  │  retry · persist · resume            │
                  └──────────────────┬───────────────────┘
                                     │
                       ┌─────────────┼─────────────┐
                       ▼             ▼             ▼
              ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
              │  Input      │ │  Process    │ │  Output     │
              │  block      │ │  block      │ │  block      │
              └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
                     └──────────────┬┴──────────────┘
                                    ▼
                  ┌──────────────────────────────────────┐
                  │  apps/api  (FastAPI)                 │
                  │   NOUS bridge — LLM-free engine      │
                  └──────────────────┬───────────────────┘
                                     │
                  ┌──────────────────┴───────────────────┐
                  ▼                                      ▼
          ┌──────────────┐                      ┌──────────────┐
          │  Supabase    │                      │  Langfuse    │
          │  Postgres +  │                      │  self-host   │
          │  pgvector +  │                      │  trace store │
          │  RLS         │                      └──────────────┘
          └──────────────┘
```

Every request gets a `trace_id`. The full pipeline — input → classify → retrieve → generate → validate → output — is recorded in Langfuse and queryable per-tenant.

---

## Design decisions (8 ADRs)

The eight architecture decisions below are written up in full in `docs/`. Each was made to address a specific failure mode observed in earlier AI products.

| # | Decision | Problem it solves |
|---|---|---|
| 001 | **Trace-First** — every module receives a `TraceContext` and emits to Langfuse | "Something failed in step 4 but we have no idea what the inputs were" |
| 002 | **Fail-soft validation** — per-check flags (`info` / `warn` / `block`) | All-or-nothing validation rejects responses that are 95% correct |
| 003 | **Annotation cache** — hand-reviewed answers cached, returned when cosine ≥ 0.92 | LLM output drift between model versions degrades customer trust |
| 004 | **Module platform** — four pluggable block types (Input / Process / Data / Output) | New business workflows shouldn't require platform changes |
| 005 | **Workflow engine** — Vercel Workflow DevKit + DurableAgent (TS primary) | Long-running, resumable workflows without building a job queue |
| 006 | **Migration plan** — three-phase (dual-write → canary → cutover) | Zero-downtime migration for tenant data |
| 007 | **Saga / compensation** — DevKit absorbs retry/persist; this repo holds the Compensation Registry | Distributed-transaction semantics without a heavy orchestrator |
| 008 | **LLM fallback** — local model → AI Gateway → vendor API → cache → static reply | Vendor outage shouldn't take down the product |

---

## Stack

| Layer | Technology |
|---|---|
| Web | Next.js 15 (App Router) |
| Workflow engine | Vercel Workflow DevKit + DurableAgent (`"use workflow"` / `"use step"`) |
| API | FastAPI (Python) — NOUS bridge |
| DB | Supabase Postgres + pgvector |
| Auth | Supabase Auth |
| Observability | Langfuse (self-host) + Vercel Workflow Dashboard |
| LLM | AI Gateway → OpenAI / Anthropic / local model (3-tier fallback) |
| Deploy | Vercel |

---

## Repository layout

```
logos/
├── apps/
│   ├── web/             # Next.js 15 (App Router) — admin UI + embedded chat
│   └── api/             # FastAPI — NOUS bridge
├── packages/
│   ├── core/            # BaseModule / Trace / Error
│   ├── observability/   # Langfuse SDK wrapper
│   ├── cache/           # AnnotationCache + Embedding
│   └── tenants/         # Multi-tenant (Supabase RLS)
├── infra/
│   ├── langfuse/        # Docker Compose (self-host)
│   └── supabase/        # Migrations + RLS policies
├── docs/                # Design notes + ADRs
└── tests/               # E2E / integration / adversarial
```

Every module implements a shared contract: `process` / `replay` / `healthcheck` / `metrics`. New business workflows plug in as block compositions — no platform changes required.

---

## Status

Design + reference scaffolding published for review (apps/web skeleton, packages/core interfaces, infra Docker compose, Supabase migrations 0001–0004). No business data is included. The eight ADRs in `docs/` are the substantive deliverable — they encode the engineering decisions that shaped the platform.

---

## License

MIT — see [LICENSE](./LICENSE).
