# ローカル環境

AWS 上と同じ Bref の Lambda ランタイムイメージ（`bref/arm-php-85:3`）を docker compose で動かし、Lambda としての動きを手元で確かめる環境の説明。
検証の経緯は [#1](https://github.com/takyafumin/sample-laravel-bref/issues/1) を参照。

- 定義: [compose.yaml](../compose.yaml)
- 起動の手順: [README の「ローカルで動かす」](../README.md#ローカルで動かす)

## 1. 構成

イメージに内蔵された Lambda Runtime Interface Emulator（RIE）が起動するので、1回のリクエストが1回の Lambda の呼び出しになる。

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
| `artisan` | `artisan` を Bref console ランタイムで実行する（serverless.yml の `artisan` 関数に相当）。ホストの `127.0.0.1:9001` で呼び出せる |
| `gateway` | HTTP リクエストを API Gateway（HTTP API, payload 2.0）のイベントに変換して `web` を呼び出す（[docker/gateway/server.mjs](../docker/gateway/server.mjs)）。ホストの `127.0.0.1:8000` で受ける |
| `serverless` | Node.js 26 上の Serverless Framework（osls）。`tools` プロファイルなので `up` では起動しない。`bin/serverless` から使う |
| `e2e` | Playwright の E2E テスト。`tools` プロファイル。`bin/e2e` から使う（[testing.md](testing.md)） |
| `cfn-lint` | CloudFormation テンプレートの検証。`tools` プロファイル。`bin/cfn-lint` と `bin/lint` から使う |

## 2. Lambda に近づけるための設定

| 設定 | 理由 |
|---|---|
| コードは `/var/task` に読み取り専用でマウントする | Lambda ではデプロイしたコードは書き換えられない |
| `storage/` と `.env` をコンテナ内で隠す | どちらもデプロイしない（serverless.yml の `package.patterns`）。Bref は `storage` を `/tmp` に移すので、その動きも再現する |
| コンテナは非 root ユーザー（uid 993）で動かす | Lambda の実行ユーザーと同じ。root だと PHP-FPM のワーカーが `/tmp` に書けない |
| gateway がリクエストを直列化する | RIE は同時に1件しか処理できない（web 関数の `reservedConcurrency: 1` に相当） |
| DB は `/mnt/db/database.sqlite` | AWS で S3 Files をマウントするパスと同じ。ローカルでは `.docker-data/db/` をマウントする |

## 3. artisan コマンドを実行する

artisan 関数（RIE）を、`bin/local-artisan` から呼び出す。引数は1つの文字列で渡す。

```bash
bin/local-artisan "migrate --force"
```

```bash
bin/local-artisan "migrate:status"
```

```bash
bin/local-artisan "tinker --execute='echo App\Models\Memo::count();'"
```

- コマンドの出力を表示し、コマンドの終了コードで終わる
- 中身は `http://127.0.0.1:9001/2015-03-31/functions/function/invocations` に、コマンドの文字列（JSON）を POST しているだけ。curl でも同じことができる

```bash
curl -s http://127.0.0.1:9001/2015-03-31/functions/function/invocations -d '"route:list"' | jq -r .output
```

## 4. ログ・停止・データ

ログを見る:

```bash
docker compose logs -f web
```

止める:

```bash
docker compose down
```

- SQLite のデータは `.docker-data/db/` に残る。消すときはこのディレクトリを削除する
- Linux では、コンテナ（uid 993）から書き込めるよう、`.docker-data/db` に書き込み権限を付けておく（`chmod 777`）
