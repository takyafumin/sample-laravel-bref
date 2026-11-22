# テストの実行

テストの種類と実行のしかた。各テストケースが何を確認しているか（何を確認していないか）は [test-cases.md](test-cases.md) を参照。

| 種類 | 対象 | 実行 |
|---|---|---|
| Feature テスト（PHPUnit） | アプリのロジック、ルーティング、DB への保存 | `php artisan test` |
| E2E テスト（Playwright） | Lambda として動いているアプリ全体（ローカルのスタック、またはデプロイした環境） | `bin/e2e` |

どちらも CI（[.github/workflows/ci.yml](../.github/workflows/ci.yml)）で PR ごとに実行する。

## 1. Feature テスト

```bash
php artisan test
```

インメモリの SQLite を使い、テストごとに DB を作り直す。Docker は要らない。

## 2. E2E テスト

[Playwright](https://playwright.dev/) でブラウザを動かし、Lambda として動いているアプリを外側から確かめる（[e2e/](../e2e/)）。Playwright は公式のコンテナイメージ（`mcr.microsoft.com/playwright`）で動かすので、ホストに Node.js は要らない。検証の経緯は [#7](https://github.com/takyafumin/sample-laravel-bref/issues/7) を参照。

### 2.1 実行する

ローカルのスタックを起動し（`docker compose up -d` とマイグレーション）、テストする。

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

### 2.2 ブラウザの動きを見る

テストはヘッドレスのブラウザで動くので、そのままでは画面が見えない。動きを確かめたいときは、次のどちらかを使う。どちらもデプロイした環境の URL を渡せる（例: `bin/e2e --ui https://...`）。検証の経緯は [#13](https://github.com/takyafumin/sample-laravel-bref/issues/13) を参照。

**録画する（`--video`）:** 操作ごとに 0.5 秒待ちながら実行し、ブラウザを使うテスト（E2E-01〜03）の画面を動画に撮る。

```bash
bin/e2e --video
```

- 動画は `e2e/test-results/` の下の、テストごとのディレクトリ（`memos-E2E-02-adds-a-memo-and-deletes-it-chromium/` のように、テスト名から作られる。リトライしたときは `-retry1` などが付いたものも）に `video.webm` として残り、実行の最後にパスを表示する
- 待ち時間は `E2E_SLOW_MO=<ミリ秒>` で変えられる

**UI モードで開く（`--ui`）:** Playwright の UI モードをコンテナで起動する。

```bash
bin/e2e --ui
```

- 「Listening on ...」と表示されたら、ホストのブラウザで http://127.0.0.1:9323/ を開く
- テストを選んで実行し、各ステップ（入力、クリック、確認）の時点のブラウザの画面を確かめられる。watch を有効にすると、テストのファイルを保存するたびに再実行される
- Ctrl+C で止める。ポートは `E2E_UI_PORT` で変えられる（例: `E2E_UI_PORT=9400 bin/e2e --ui`）
- UI モードは Service Worker を使うので、Chrome などの通常のブラウザで開く（Claude のデスクトップアプリ内のブラウザでは表示されなかった）
- UI モードのサーバーは、ホストのループバック（127.0.0.1）にだけ公開する

### 2.3 注意点

- **失敗したときのトレース:** `e2e/test-results/` に残る（CI では artifact としてアップロードする）。`npx playwright show-trace` や https://trace.playwright.dev/ で開ける
- **デプロイした環境に向けたとき:** スロットリングやコールドスタートに備えて、リトライを2回にし、expect のタイムアウトを15秒に延ばす
- **1ワーカーで順番に実行する:** web 関数の `reservedConcurrency: 1` と、ローカルの RIE が同時に1件しか処理できないことに合わせている
- **共有 DB への配慮:** AWS の DB は共有なので、テストで作るメモは一意な本文にして、同じテストの中で削除する。テストが途中で失敗すると、`e2e ` で始まるメモが残ることがある
- **CI:** `e2e` ジョブが arm64 のランナー（`ubuntu-24.04-arm`）でローカルのスタックを起動して実行する。デプロイした環境に向けた E2E は、GitHub Actions のデプロイのワークフローで実行する（[github-actions-deploy.md](github-actions-deploy.md)）
