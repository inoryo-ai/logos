# @logos/core

全モジュールが従う基本契約: `BaseModule`, `TraceContext`, `LogosError`

## BaseModule 契約

```python
from abc import ABC, abstractmethod
from typing import Any
from .trace import TraceContext

class BaseModule(ABC):
    """全モジュール共通の契約。Logos の全 process は trace_id を必須引数とする。"""

    name: str                          # "intent_classifier", "knowledge_retrieval" 等
    version: str                       # "1.0.0" semver

    @abstractmethod
    async def process(
        self,
        trace: TraceContext,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        """主処理。Langfuse span を内部で開閉する。"""
        ...

    @abstractmethod
    async def replay(
        self,
        trace_id: str,
    ) -> dict[str, Any]:
        """trace_id から過去入力を取得し再実行。bug 再現専用。"""
        ...

    @abstractmethod
    async def healthcheck(self) -> dict[str, Any]:
        """依存先 (DB, LLM, MCP) の疎通確認。/health で集約。"""
        ...

    def metrics(self) -> dict[str, Any]:
        """Prometheus 形式の自モジュールメトリクス。default: 空。"""
        return {}
```

## TraceContext

```python
from dataclasses import dataclass, field
from datetime import datetime
from uuid import uuid4

@dataclass
class TraceContext:
    trace_id: str                      # UUIDv7 (時系列順)
    tenant_id: str
    parent_span_id: str | None = None
    started_at: datetime = field(default_factory=datetime.utcnow)
    metadata: dict = field(default_factory=dict)

    def child(self, module_name: str) -> "TraceContext":
        """子モジュール用に派生 (parent_span_id を継承)。"""
        ...
```

## エラー階層

```python
class LogosError(Exception):
    """Logos 全エラーの基底。trace_id を必ず持つ。"""
    trace_id: str
    check_id: str | None
    severity: str  # "info" | "warn" | "block"

class ValidationError(LogosError): ...
class UpstreamError(LogosError): ...  # LLM/MCP/DB 失敗
class TenantViolationError(LogosError): ...  # RLS 侵害候補
```

## 実装予定

- W1D1 (今日): interface 定義 (このファイル)
- W1D3: Pydantic 化 + Langfuse SDK ラップ
- W1D4: 最初の実装モジュール (IntentClassifier) で実証
