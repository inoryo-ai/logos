# ADR-006: Migration Plan (Tenant A → Logos)

**Date**: 2026-05-23
**Status**: Accepted

## Context

Week 6 で Tenant A (tenant-a) を Logos に切替予定だが、データ移行と切替手順が未設計。
- 会話履歴 (`wf_chat_log`)
- ユーザプロファイル (`wf_user_profile`)
- 提案ログ (`wf_suggestion_log`)
- 未解決 inquiry (`wf_unresolved_inquiries`)
- 18 JSON books (1,037 lessons + roadmap + career + faq + …)

を新 Supabase に整合性を保ったまま移し、本番ダウンタイム最小で切替する必要がある。

## Decision

### 3 段階移行

```
[Phase A] 並行書込 (Week 5 中盤) → [Phase B] カナリア切替 (Week 6) → [Phase C] 旧停止 (Week 10)
```

#### Phase A: 並行書込 (3-5 日)

- Tenant A 本番に `LogosWriter` middleware を追加
- 全リクエストを **legacy system DB に書く + 同時に Logos DB にも書く**
- 応答はlegacy system から返す (Logos 側は read 検証用)
- 不一致発生時は warning ログのみ (本番影響なし)
- 整合性スクリプトを 1 時間ごとに実行し diff を Slack 通知

#### Phase B: カナリア切替 (Week 6, 5 日間)

| Day | 比率 | 動作 |
|---|---|---|
| Day 1 | 5% | 一部リクエストを Logos へ。応答も Logos から返す。残り 95% はlegacy system |
| Day 2 | 25% | エラー率・レイテンシを実測比較 |
| Day 3 | 50% | 半々比較 |
| Day 4 | 100% | 全リクエスト Logos へ |
| Day 5 | 監視 | 24h 異常なし確認 |

各 Day で以下を判定:
- エラー率 < 0.5%
- p95 レイテンシ ≤ legacy system + 20%
- annotation 不一致 < 5%

1 つでも NG → 即ロールバック (LogosWriter の応答先をlegacy system に戻すだけ)

#### Phase C: legacy system 停止 (Week 10)

- Logos 単独運用 4 週間異常なしを確認
- legacy system を read-only モードに変更
- さらに 4 週間 (合計 8 週、Week 14) 維持後、legacy system アーカイブ化

### データ移行スクリプト

```
migrations/
├── 001_export_wf.py           # legacy system DB → JSONL ダンプ
├── 002_transform.py           # スキーマ変換 (wf_chat_log → traces + messages)
├── 003_load_logos.py          # Logos DB へ bulk insert
├── 004_books_import.py        # 18 JSON books → annotations + knowledge_base
├── 005_verify_hash.py         # 行数・SHA256 一致検証
└── 006_rollback.py            # Logos 側全削除 (緊急用)
```

### 整合性検証 (Phase A 中継続)

| 検査 | 頻度 | 失敗時 |
|---|---|---|
| 行数一致 (旧/新) | 5 分ごと | Slack alert |
| 直近 1 時間の各 row SHA256 一致 | 1 時間ごと | warning |
| サンプル 100 件の意味的一致 (Logos 応答と旧応答の cosine 類似度 > 0.8) | 6 時間ごと | review tag |

### ロールバック手順

| 段階 | ロールバック方法 | 工数 |
|---|---|---|
| Phase A | LogosWriter middleware を無効化 (1 環境変数変更) | < 1 分 |
| Phase B | カナリア比率を 0% に戻す + LogosWriter 無効化 | < 5 分 |
| Phase C | legacy system を read-only → read-write に戻す + DNS 切戻 | < 30 分 |

### ダウンタイム

- Phase A: 0 (並行書込みは透過)
- Phase B: 0 (比率切替はリクエスト単位)
- Phase C: 0 (legacy system はそのまま残し、新規受付のみ Logos)

実質ダウンタイム **0 分** が目標。

## Consequences

**正の影響**
- 本番影響を最小化した段階移行
- 各段階で即ロールバック可能
- 整合性問題を本番切替前に発見可能

**負の影響**
- 並行書込み期間中はインフラコスト 2 倍
- LogosWriter middleware の実装工数 (約 2 日)
- 整合性スクリプトの維持

## 関連

- ADR-001: Trace-First (整合性検証も trace 経由)
- ADR-004: モジュール基盤 (移行スクリプトも BaseModule)
- ADR-007: Outbox (移行中の重複防止)
