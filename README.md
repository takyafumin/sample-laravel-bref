# sample-laravel-bref

Bref で Laravel を AWS Lambda にデプロイする構成の検証用リポジトリ。

- Laravel 13 / PHP 8.5 / Bref 3（`bref/laravel-bridge`）
- 検証用アプリ: 簡易メモ（一覧・追加・削除）
- DB: SQLite。AWS では S3 バケットを [S3 Files](https://docs.aws.amazon.com/lambda/latest/dg/configuration-filesystem-s3files.html) で `/mnt/db` にマウントして使う（[#2](https://github.com/takyafumin/sample-laravel-bref/issues/2)）

## ローカル検証（[#1](https://github.com/takyafumin/sample-laravel-bref/issues/1)）

AWS 上と同じ Bref の Lambda ランタイムイメージ（`bref/arm-php-85:3`）を docker compose で動かす。
イメージに内蔵された Lambda Runtime Interface Emulator（RIE）が起動するため、1リクエストが1回の Lambda 呼び出しになる。

```
browser ──HTTP──▶ gateway (:8000) ──API Gateway v2 event──▶ web (RIE + Bref FPM runtime)
                                                                 │
bin/local-artisan ──event "<command>"──▶ artisan (:9001, RIE + Bref console runtime)
                                                                 │
                                                  /mnt/db/database.sqlite (.docker-data/db)
```

| サービス | 役割 |
|---|---|
| `web` | `public/index.php` を Bref FPM ランタイムで実行する（serverless.yml の `web` 関数に相当） |
| `artisan` | `artisan` を Bref console ランタイムで実行する（serverless.yml の `artisan` 関数に相当） |
| `gateway` | HTTP リクエストを API Gateway（HTTP API, payload 2.0）のイベントに変換して `web` を呼び出す（[docker/gateway/server.mjs](docker/gateway/server.mjs)） |
| `serverless` | 最新版 Node.js 上の Serverless Framework（osls）。`tools` プロファイルのため `up` では起動しない |

Lambda 上の挙動に近づけるため、次の設定にしている。

- コードは `/var/task` に読み取り専用でマウントする
- デプロイされない `storage/` と `.env` はコンテナ内で隠す
- コンテナは Lambda と同じ非 root ユーザー（uid 993）で動かす

### 起動

```bash
cp .env.example .env
```

```bash
composer install
```

```bash
php artisan key:generate
```

```bash
docker compose up -d
```

```bash
bin/local-artisan "migrate --force"
```

http://localhost:8000/ を開く。

### その他

```bash
docker compose logs -f web
```

```bash
docker compose run --rm serverless package --stage dev
```

```bash
docker compose down
```

SQLite のデータは `.docker-data/db/` に残る。消すときはこのディレクトリを削除する。
