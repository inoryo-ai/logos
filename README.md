# Logos

**Multi-tenant business workflow platform** — observability-first, fail-soft validation, and ChatGPT output stabilization (annotation cache) as a foundation for low-code business modules.

## Design Goals

- **Trace-first**: every request carries a `trace_id`; input → classify → retrieve → generate → validate → output is recorded in Langfuse.
- **Fail-soft validation**: replaces all-or-nothing fallback with per-check flags (info / warn / block) so partial degradation is possible.
- **Annotation cache**: hand-reviewed answers are reused via embedding cosine similarity to suppress LLM output drift.
- **Multi-tenant from day 1**: tenant isolation via Supabase RLS.
- **BaseModule interface**: every module conforms to a shared contract (process / replay / healthcheck / metrics).

## Monorepo Layout

```
logos/
├── apps/
│   ├── web/          # Next.js 15 (App Router) — admin UI + embedded chat
│   └── api/          # FastAPI — NOUS bridge
├── packages/
│   ├── core/         # BaseModule / Trace / Error
│   ├── observability/# Langfuse SDK wrapper
│   ├── cache/        # AnnotationCache + Embedding
│   └── tenants/      # Multi-tenant (Supabase RLS)
├── infra/
│   ├── langfuse/     # Docker Compose (self-host)
│   └── supabase/     # Migrations + RLS policies
├── docs/             # Design notes + ADRs
└── tests/            # E2E / integration / adversarial
```

## Stack

| Layer | Technology |
|---|---|
| Web | Next.js 15 (App Router) |
| Workflow Engine | Vercel Workflow DevKit + DurableAgent (`"use workflow"` / `"use step"`) |
| API | FastAPI (Python) — NOUS bridge |
| DB | Supabase Postgres + pgvector |
| Auth | Supabase Auth |
| Observability | Langfuse (self-host) + Vercel Workflow Dashboard |
| LLM | AI Gateway → OpenAI / Anthropic / local model (3-tier fallback) |
| Deploy | Vercel |

## 8 ADRs (architecture decisions)

| # | Title | Summary |
|---|---|---|
| 001 | Trace-First | Every module receives a `TraceContext` and emits to Langfuse |
| 002 | Fail-soft Validation | Per-check flags (info / warn / block) for partial degradation |
| 003 | Annotation Cache | Cached answers with `pgvector` cosine > 0.92 returned immediately |
| 004 | Module Platform | Four pluggable block types (Input / Process / Data / Output) |
| 005 | Workflow Engine | Vercel Workflow DevKit + DurableAgent (TS primary) |
| 006 | Migration Plan | Three-phase (dual-write → canary → cutover) for zero downtime |
| 007 | Saga / Compensation | DevKit absorbs retry/persist; this repo holds the Compensation Registry only |
| 008 | LLM Fallback | Local model → AI Gateway → vendor API → cache → static reply |

See `docs/` for the full text of each ADR.

## Status

Early scaffolding (`apps/web` skeleton, `packages/core` interfaces, infra Docker compose, Supabase migrations 0001–0004). Public release of design + skeleton — no business data is included.

## License

MIT — see `LICENSE`.
