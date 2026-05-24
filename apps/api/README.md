# Logos NOUS Bridge (FastAPI)

ADR-005 で TypeScript 主体に方向修正したため、この service は **NOUS MCP server への橋渡しのみ** を担当する縮小版。

## 起動

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

`NOUS_MCP_HOST` 環境変数で NOUS の実体 (デフォルト http://localhost:7860) を指す。

## エンドポイント

| Path | 用途 |
|---|---|
| `GET /healthz` | DevKit / Vercel から疎通確認 |
| `POST /nous/ask` | TypeScript step `askNous()` が呼ぶ唯一の入口 |

## 拡張禁止事項

- 業務ロジック (caching / validator / chart) は TS 側 step に書く
- 新エンドポイントを足したくなったら ADR-005 を読み返す
- HTTP 越しの NOUS 呼出が DevKit step の中で起きる構造を維持
