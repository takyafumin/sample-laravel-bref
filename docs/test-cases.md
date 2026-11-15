# テストケース一覧

自動テストで何を確認しているか（何が担保されているか）と、何を確認していないかをまとめる。
テストを追加・変更したときは、この一覧も更新する。

## 1. テストの種類

| 種類 | 実行するもの | 対象 | 実行方法 | CI |
|---|---|---|---|---|
| Feature テスト（PHPUnit） | Laravel のアプリケーション（HTTP カーネルを直接呼ぶ） | アプリのロジック、ルーティング、DB への保存 | `php artisan test` | `lint-and-test` ジョブ |
| E2E テスト（Playwright） | ブラウザ（Chromium）と HTTP クライアント | Lambda として動いているアプリ全体（ローカルの RIE + gateway、またはデプロイした環境） | `bin/e2e`、`bin/e2e <URL>` | `e2e` ジョブ（ローカルのスタックに対して） |

Feature テストは速く、DB を毎回作り直す（`RefreshDatabase`、インメモリの SQLite）。
E2E テストは、Bref のランタイム、API Gateway のイベント変換、ファイル上の SQLite、セッションの Cookie、CSRF を含めて、外側から確認する。

## 2. Feature テスト（PHPUnit）

| ID | テスト | 確認すること | 期待する結果 |
|---|---|---|---|
| F-01 | `MemoTest::test_index_lists_memos` | 一覧に保存済みのメモが出る | 200、本文が表示される |
| F-02 | `MemoTest::test_store_creates_memo` | メモを追加できる | `/` にリダイレクト、DB に保存される |
| F-03 | `MemoTest::test_store_requires_body` | 空のメモは保存されない | `body` のバリデーションエラー、DB は0件のまま |
| F-04 | `MemoTest::test_destroy_deletes_memo` | メモを削除できる | `/` にリダイレクト、DB から消える |
| F-05 | `RoutesTest::test_only_expected_routes_are_exposed` | 公開しているルートが想定どおり | `GET /`、`POST /memos`、`DELETE /memos/{memo}`、`GET /up` の4つだけ |
| F-06 | `RoutesTest::test_unused_routes_are_not_found` | Bref・Laravel が既定で足すルートを無効にしている（#4） | `POST /signed-upload-url`、`GET /storage/...` が 404 |

Feature テストでは、CSRF の検証は無効になる（Laravel がテスト中は省略する）。

## 3. E2E テスト（Playwright）

テストの定義: [e2e/tests/memos.spec.ts](../e2e/tests/memos.spec.ts)。テスト名の先頭に ID を付けている。

| ID | 確認すること | 手順 | 期待する結果 |
|---|---|---|---|
| E2E-01 | 一覧が Lambda のランタイムで表示される | `/` を開く | 200、見出し「Memos」が表示される、画面下の「Lambda」が `yes`（`LAMBDA_TASK_ROOT` がある＝ Bref のランタイムで動いている） |
| E2E-02 | ブラウザからメモを追加・削除できる | 一意な本文を入力して「追加」→ そのメモの「削除」 | 追加後、`/` に戻り、一覧にそのメモが1件出る。削除後、一覧から消える |
| E2E-03 | 長すぎるメモはサーバー側で弾かれる | 入力欄の `maxlength` を外し、1001文字を入力して「追加」 | エラーメッセージが表示され、一覧には追加されない |
| E2E-04 | ヘルスチェックが応答する | `GET /up` | 200 |
| E2E-05 | CSRF トークンのない POST は拒否される | トークンなしで `POST /memos` | 419 |
| E2E-06 | 定義していないルートは 404 になる | `GET /signed-upload-url`、`GET /storage/e2e.txt`、`GET /does-not-exist` | すべて 404 |

### E2E テストで担保されること

E2E-02 が通ると、次がまとめて動いていることになる。

- gateway（ローカル）または API Gateway（AWS）から、Bref の FPM ランタイムへのリクエストの受け渡し
- セッションの Cookie の発行と受け取り（`SESSION_DRIVER=cookie`）と、フォームの CSRF トークン
- POST → リダイレクト → GET の流れと、リダイレクト先の URL の生成
- `/mnt/db/database.sqlite` への書き込みと読み込み（ローカルは `.docker-data/db`、AWS は S3 Files）

### 共有 DB への配慮

デプロイした環境の DB は共有なので、次のようにしている。

- テストで作るメモは、`e2e <種類> <時刻>-<乱数>` という一意な本文にし、同じテストの中で削除する
- テストが途中で失敗すると、`e2e ` で始まるメモが残ることがある
- E2E-03 と E2E-05 は、正しく動いていればメモを作らない

## 4. 自動テストで確認していないこと

次の項目は自動テストの対象外。#2 の検証では手動で確認した（[docs/aws-architecture.md](aws-architecture.md)、PR #6 の検証結果）。

| 項目 | 理由・補足 |
|---|---|
| コールドスタートをまたいでデータが残ること | 強制的な再デプロイが必要。#2 で手動確認 |
| S3 バケットへの書き出し（S3 Files の同期） | 書き込みから約1分かかり、AWS の権限も要る。#2 で手動確認 |
| メンテナンスモード（`MAINTENANCE_MODE`）で 503 になること | パラメータを変えて再デプロイする必要がある。#2 で手動確認 |
| 同時実行数 1 によるスロットリング（429/503） | 同時にリクエストを送る負荷のテストは行っていない |
| artisan 関数（マイグレーションなど） | `bin/e2e` がローカルで `migrate` を流すので、起動できることは間接的に確認している |
| https のときの URL の生成（`https://` のリダイレクト） | ローカルは http。AWS に向けて E2E を実行したときだけ確認される |
| ネットワークの分離、IAM の最小権限 | インフラの設定。cfn-lint（`bin/cfn-lint`）と #2 の手動確認で扱う |
| 見た目（レイアウト、スタイル） | 文言と要素の有無だけを確認している |
| 日本語などのマルチバイト文字の保存 | テストの本文は ASCII のみ |

## 5. CI での実行

| ジョブ | ランナー | 内容 |
|---|---|---|
| `lint-and-test` | `ubuntu-latest` | `bin/lint`（gitleaks、Pint、Larastan、Prettier、ShellCheck、Hadolint、compose、actionlint）と Feature テスト |
| `e2e` | `ubuntu-24.04-arm` | ローカルのスタック（`bref/arm-php-85` は arm64）を起動して E2E テスト。失敗時はコンテナのログとトレースを残す |

デプロイした AWS 環境に向けた E2E テストは CI では実行しない（AWS の認証情報を CI に置かないため）。デプロイ後に手元で `bin/e2e <URL>` を実行する。
