# Langfuse self-host (Logos 観測性基盤)

ADR-001 (Trace-First) を実装する trace + annotation + eval の中央ストア。

## ローカル起動

```bash
cp .env.example .env
# 4 つの値を openssl で生成 (.env.example のコメント参照)

docker compose up -d
# → http://localhost:3100 で UI 起動
```

初回アクセス時に管理者アカウントを作成 → プロジェクト "logos" を作成 → API key を取得して
`apps/web/.env.local` と `apps/api/.env` に貼る:

```
LANGFUSE_HOST=http://localhost:3100
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

## 本番運用 (Week 1 後半)

| 候補 | 月額 | 備考 |
|---|---|---|
| Hetzner CX22 | ~600円 | 既定。バックアップは Storage Box 別途 |
| Oracle Cloud Free | 0円 | Always Free 枠で運用可、永続性不安 |
| Langfuse Cloud (有料) | 5,000円〜 | 自前運用工数を放棄する場合 |

本番では `langfuse-db` を Supabase Postgres に寄せて 1 DB 化することも検討。

## バックアップ

Postgres ボリュームを日次で snapshot。Trace は 90 日保持・以降アーカイブ DB へ。
