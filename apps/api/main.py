"""
Logos API — FastAPI NOUS bridge.

Scope after ADR-005: this service exists ONLY to bridge TypeScript workflows
(Vercel Workflow DevKit) to the Python NOUS MCP server. Business logic lives
in TS step functions; do not grow this file.
"""
from __future__ import annotations

import os
import time
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="logos-nous-bridge", version="0.0.1")

NOUS_HOST = os.getenv("NOUS_MCP_HOST", "http://localhost:7860")


class AskRequest(BaseModel):
    prompt: str
    tenant_id: str
    user_id: str | None = None
    trace_id: str | None = None


class AskResponse(BaseModel):
    answer: str
    provider: str
    latency_ms: int
    tenant_id: str


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/nous/ask", response_model=AskResponse)
async def nous_ask(req: AskRequest) -> AskResponse:
    t0 = time.perf_counter()
    try:
        answer = await _call_nous(req.prompt, req.tenant_id)
    except UpstreamError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return AskResponse(
        answer=answer,
        provider="nous",
        latency_ms=int((time.perf_counter() - t0) * 1000),
        tenant_id=req.tenant_id,
    )


class UpstreamError(RuntimeError):
    pass


async def _call_nous(prompt: str, tenant_id: str) -> str:
    # Week 1 stub. Week 2 wires the real NOUS MCP client and adds tenant scoping.
    _ = (prompt, tenant_id)
    return "(NOUS bridge placeholder — Week 2 connects MCP)"


def _trace_metadata(_req: AskRequest) -> dict[str, Any]:
    # Placeholder for Langfuse span emission per ADR-001.
    return {}
