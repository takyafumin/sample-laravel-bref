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
| `serverless` | Node.js 26 上の Serverless Framework（osls）。`tools` プロファイルのため `up` では起動しない。`bin/serverless` から使う |

Lambda 上の挙動に近づけるため、次の設定にしている。

- コードは `/var/task` に読み取り専用でマウントする
- デプロイされない `storage/` と `.env` はコンテナ内で隠す
- コンテナは Lambda と同じ非 root ユーザー（uid 993）で動かす
- RIE は同時に1件しか処理できないため、gateway がリクエストを直列化する（web 関数の reservedConcurrency 1 に相当）

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
mkdir -p .docker-data/db && chmod 777 .docker-data/db  # Linux: コンテナの uid 993 から書き込めるようにする
```

```bash
docker compose up -d
```

```bash
bin/local-artisan "migrate --force"
```

http://localhost:8000/ を開く。

### コード品質チェック（必須）

フォーマッタと linter をまとめて実行する。CI（`.github/workflows/ci.yml`）でも PR ごとに同じチェックとテストが走る。

| 対象 | ツール |
|---|---|
| クレデンシャル混入 | gitleaks（コミット履歴、未コミットの変更、ステージ済みの変更） |
| PHP | Pint（フォーマット）、Larastan / PHPStan level max（静的解析） |
| JavaScript / TypeScript（gateway、E2E テスト） | Prettier |
| シェルスクリプト | ShellCheck |
| Dockerfile | Hadolint |
| compose.yaml | `docker compose config` |
| GitHub Actions | actionlint |
| CloudFormation（`infra/`） | cfn-lint |

PHP 以外のツールは Docker で動かすため、ホストの Node.js のバージョンには依存しない。

```bash
composer lint
```

```bash
composer lint:fix
```

```bash
php artisan test
```

### E2E テスト（[#7](https://github.com/takyafumin/sample-laravel-bref/issues/7)）

[Playwright](https://playwright.dev/) でブラウザを動かし、Lambda として動いているアプリを外側から確認する（[e2e/](e2e/)）。Playwright は公式のコンテナイメージ（`mcr.microsoft.com/playwright`）で動かすので、ホストに Node.js は要らない。

各テストケースが何を確認しているか、自動テストで確認していないことは何かは、[docs/test-cases.md](docs/test-cases.md) にまとめている（Feature テストも含む）。

ローカルのスタック（`docker compose up -d` とマイグレーション）を起動してからテストする。

```bash
bin/e2e
```

デプロイした AWS 環境に向けて実行するときは、API Gateway のエンドポイントを渡す。

```bash
bin/e2e https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com
```

`--` のあとに Playwright のオプションを渡せる。

```bash
bin/e2e -- --grep CSRF
```

- 失敗したテストのトレースは `e2e/test-results/` に残る（CI では artifact としてアップロードする）。`npx playwright show-trace` や https://trace.playwright.dev/ で開ける
- https の URL（デプロイした環境）に向けたときは、スロットリングやコールドスタートに備えて、リトライを2回にし、expect のタイムアウトを15秒に延ばす
- テストは1ワーカーで順番に実行する（web 関数の `reservedConcurrency: 1` と、ローカルの RIE が同時に1件しか処理できないことに合わせている）
- AWS の DB は共有なので、テストで作るメモは一意な本文にして、同じテストの中で削除する。テストが途中で失敗すると、`e2e ` で始まるメモが残ることがある
- CI では `e2e` ジョブが arm64 のランナー（`ubuntu-24.04-arm`）でローカルのスタックを起動して実行する

#### ブラウザの動きを見る（[#13](https://github.com/takyafumin/sample-laravel-bref/issues/13)）

テストはヘッドレスのブラウザで動くので、そのままでは画面が見えない。動きを確かめたいときは、次のどちらかを使う。どちらもデプロイした環境の URL を渡せる（例: `bin/e2e --ui https://...`）。

**録画する（`--video`）:** 操作ごとに 0.5 秒待ちながら実行し、ブラウザを使うテスト（E2E-01〜03）の画面を動画に撮る。動画は `e2e/test-results/` の下の、テストごとのディレクトリ（`memos-E2E-02-adds-a-memo-and-deletes-it-chromium/` のように、テスト名から作られる。リトライしたときは `-retry1` などが付いたものも）に `video.webm` として残り、実行の最後にパスを表示する。待ち時間は `E2E_SLOW_MO=<ミリ秒>` で変えられる。

```bash
bin/e2e --video
```

**UI モードで開く（`--ui`）:** Playwright の UI モードをコンテナで起動する。ホストのブラウザで http://127.0.0.1:9323/ を開くと、テストを選んで実行し、各ステップ（入力、クリック、確認）の時点のブラウザの画面を確かめられる。watch を有効にすると、テストのファイルを保存するたびに再実行される。Ctrl+C で止める。ポートは `E2E_UI_PORT` で変えられる。

```bash
bin/e2e --ui
```

- UI モードは Service Worker を使うので、Chrome などの通常のブラウザで開く（Claude のデスクトップアプリ内のブラウザでは表示されなかった）
- UI モードのサーバーは、ホストのループバック（127.0.0.1）にだけ公開する

### その他

```bash
docker compose logs -f web
```


```bash
docker compose down
```

SQLite のデータは `.docker-data/db/` に残る。消すときはこのディレクトリを削除する。

## AWS デプロイ（[#2](https://github.com/takyafumin/sample-laravel-bref/issues/2)）

構成の詳細（リソース一覧、IAM、設計判断、制約）は [docs/aws-architecture.md](docs/aws-architecture.md) にまとめている。

![AWS 構成図](docs/architecture.drawio.svg)

```
browser ─▶ API Gateway (HTTP API) ─▶ web Lambda ─┐  (VPC, private subnets only)
                                   artisan Lambda ┤
                                                  └─NFS─▶ S3 Files mount targets ─▶ S3 Files file system ◀─sync─▶ S3 bucket (versioned)
                                                          /mnt/db/database.sqlite                              database.sqlite
```

- Lambda は VPC 内のプライベートサブネットで動かす。NAT ゲートウェイは置かない（外部へのアクセスは不要）
- SQLite は S3 Files のアクセスポイント経由で `/mnt/db` にマウントする。中身は S3 バケットと同期される（書き込みが S3 に反映されるまで最大1分ほどかかる）
- SQLite の書き込みが競合しないよう、web と artisan はどちらも `reservedConcurrency: 1` にしている。ただし2つの関数は同時に動けるので、マイグレーションはメンテナンスモード中に流す
- APP_KEY は SSM Parameter Store（SecureString）に置き、デプロイ時に解決する。Lambda はインターネットに出られないので、実行時には SSM を読めないためである。そのため値は、CloudFormation テンプレートと Lambda の環境変数に平文で入る。実行時に解決したい場合は、SSM のインターフェース VPC エンドポイント（有料）を追加し、Bref の `bref-ssm:` を使う
- S3 Files の Direct S3 Reads（S3 から直接読む最適化）は無効にしている。S3 へのネットワーク経路がなく、小さな SQLite には効果もないため

AWS プロファイルは既定で `takyafumin`（SSO）。別のプロファイルを使うときは、環境変数 `AWS_PROFILE` で上書きする。

### デプロイ

ホストに必要なもの: AWS CLI v2、Docker、PHP と Composer（`bin/deploy` と `bin/aws-put-app-key` が使う）、jq（`bin/serverless` と `bin/aws-remove` が使う）、gh（`bin/aws-bootstrap-github-deploy` が使う）。

```bash
aws sso login --profile takyafumin
```

デプロイ用のロールを作る（AWS アカウントごとに1回。詳細は「GitHub Actions からのデプロイ」）。serverless.yml がこのスタックからロールの ARN を読むので、手元からデプロイするときにも必要。

```bash
bin/aws-bootstrap-github-deploy
```

```bash
bin/aws-put-app-key dev
```

```bash
bin/deploy dev
```

```bash
bin/serverless bref:cli --stage dev --args="migrate --force"
```

初回のデプロイ直後は、マウントがタイムアウトしてマイグレーションが失敗することがある。その場合は少し待って再実行する。

2回目以降のマイグレーションは、web 関数が書き込まないよう、メンテナンスモード中に流す。Lambda では `artisan down` は実行した環境にしか効かないので、Bref の `MAINTENANCE_MODE`（`maintenance` パラメータ）を有効にしてデプロイする。

```bash
bin/deploy dev --param="maintenance=1"
```

```bash
bin/serverless bref:cli --stage dev --args="migrate --force"
```

```bash
bin/deploy dev
```

`bin/deploy` は dev 依存を外してからデプロイし、終わると `composer install` で元に戻す。変更がなくても再デプロイしたいときは `bin/deploy dev --force` を使う。Serverless CLI は、ホストのプロファイルから取得した一時的な認証情報を渡して、コンテナで実行する（`bin/serverless`）。

### GitHub Actions からのデプロイ（[#9](https://github.com/takyafumin/sample-laravel-bref/issues/9)）

手順書: [docs/github-actions-deploy.md](docs/github-actions-deploy.md)（仕組みの図、初回の準備、権限の設計、うまくいかないときの対応）

![GitHub Actions からのデプロイ](docs/github-deploy.drawio.svg)

Actions → **Deploy** → **Run workflow** で、ステージを選んで実行する（main ブランチからだけ）。

1. GitHub の OIDC でデプロイ用のロールを引き受ける（長期のアクセスキーは GitHub に置かない）
2. `bin/aws-release <stage>` でデプロイし、未実行のマイグレーションを流す（未実行のものがあるときはメンテナンスモードで）
3. デプロイした環境に向けて E2E テスト（`bin/e2e <エンドポイント>`）を実行する

初回は、AWS のデプロイ用ロール（`bin/aws-bootstrap-github-deploy`）、GitHub の environment `dev` と変数 `AWS_DEPLOY_ROLE_ARN`、APP_KEY の準備が要る（手順書の「初回の準備」）。手元から同じ手順を実行するときは `bin/aws-release dev` を使う。

### テンプレートの検証

```bash
bin/cfn-lint dev
```

`bin/serverless package` で生成した CloudFormation テンプレートを cfn-lint で検証する。SSM と CloudFormation の参照を解決するため AWS の認証情報が必要で、`bin/lint`（CI）には含めていない。`infra/` のテンプレートは認証情報なしで検証できるので、`bin/lint` で検証している。

### 検証で分かったこと

- **作成直後はマウントがタイムアウトすることがある:** デプロイ直後の最初の呼び出しで `S3FilesMountTimeoutException` になった。少し待って再試行すると成功した（AWS のドキュメントにも、時間を置いて再試行するよう書かれている）。
- **新しいファイルが別の関数から見えるまで遅れることがある:** artisan 関数が作った直後の `database.sqlite` が、web 関数からは1分ほど見えなかった。NFS クライアントがディレクトリ情報をキャッシュするためと考えられる。既存ファイルの読み書きは即時に反映された。
- **S3 への反映は約1分後:** S3 Files は書き込みが60秒止まってから S3 に書き出す。S3 上のキーはアクセスポイントのルートに合わせて `lambda/database.sqlite` になる。
- **S3 上のコピーも有効な DB:** ダウンロードした `database.sqlite` を sqlite3 で開くと、`integrity_check` は `ok` で、journal モードは既定の `delete` だった。
- **コールドスタート後もデータは残る:** 再デプロイで実行環境を作り直した後も、メモはそのまま残っていた。

### 後片付け

```bash
bin/aws-remove dev
```

`bin/aws-remove` は、先に `serverless remove` でスタックを削除し、その後でデータベースのバケットを空にして削除する。

- **バケットを後から消す理由:** スタックの削除中も、S3 Files が保留中の書き込みを S3 に書き出すことがある。そのためバケットは `DeletionPolicy: Retain` にして、スタックが消えてから片付けている。
- **時間がかかることがある:** VPC 内の Lambda のネットワークインターフェースは、解放に数十分かかることがある。そのあいだに SSO の一時認証情報が切れると、`serverless remove` の待機だけが失敗する。削除自体は CloudFormation 側で続くので、再ログインしてもう一度実行すればよい。

