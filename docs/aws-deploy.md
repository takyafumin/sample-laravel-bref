# AWS へのデプロイ（手元から）

手元のマシンから AWS にデプロイする手順。構成の設計は [aws-architecture.md](aws-architecture.md)、GitHub Actions からのデプロイは [github-actions-deploy.md](github-actions-deploy.md) を参照。
検証の経緯は [#2](https://github.com/takyafumin/sample-laravel-bref/issues/2) を参照。

## 1. 準備

### 1.1 ホストに必要なもの

| ツール | 使うスクリプト |
|---|---|
| AWS CLI v2 | すべての `bin/aws-*`、`bin/serverless` |
| Docker | `bin/serverless`（Serverless Framework をコンテナで動かす）、`bin/e2e` |
| PHP と Composer | `bin/deploy`（dev 依存を外してパッケージを作る）、`bin/aws-put-app-key` |
| jq | `bin/serverless`、`bin/aws-release`、`bin/aws-remove` |
| gh | `bin/aws-bootstrap-github-deploy`（リポジトリの OIDC の設定を読む） |

あわせて、リポジトリで `composer install`、`cp .env.example .env`、`php artisan key:generate` を済ませておく（[README の「ローカルで動かす」](../README.md#ローカルで動かす)）。

- `bin/serverless` は Serverless Framework を docker compose で動かすので、compose.yaml が `.env` の APP_KEY を必要とする。ない場合、`bin/serverless` を使うデプロイ・削除・検証のスクリプトはすべて失敗する（デプロイ先の APP_KEY には SSM のものを使う）
- `bin/aws-put-app-key` は `php artisan key:generate --show` で値を作るので、vendor/ が要る

### 1.2 AWS にログインする

AWS プロファイルは既定で `takyafumin`（SSO）。別のプロファイルを使うときは、環境変数 `AWS_PROFILE` で上書きする。

```bash
aws sso login --profile takyafumin
```

`bin/serverless` は、プロファイルから一時的な認証情報を取り出し、環境変数で Serverless Framework のコンテナに渡す（ファイルには書かない）。

### 1.3 初回だけ行うこと

デプロイ用のロールを作る（AWS アカウントごとに1回）。serverless.yml は、CloudFormation に渡すロールと permissions boundary の ARN をこのスタックから読むので、手元からデプロイするときにも必要。詳細は [github-actions-deploy.md の「初回の準備」](github-actions-deploy.md#4-初回の準備)。

```bash
bin/aws-bootstrap-github-deploy
```

ステージの APP_KEY を SSM Parameter Store（SecureString）に作る（すでにあれば何もしない）。

```bash
bin/aws-put-app-key dev
```

## 2. デプロイする

### 2.1 デプロイとマイグレーションをまとめて行う（おすすめ）

```bash
bin/aws-release dev
```

GitHub Actions のデプロイと同じスクリプト。状態を見て、次のように進める（詳細は [github-actions-deploy.md の「デプロイとマイグレーションの判定」](github-actions-deploy.md#3-デプロイとマイグレーションの判定)）。

| 状態 | 手順 |
|---|---|
| スタックがない（初回） | デプロイ → マイグレーション |
| 未実行のマイグレーションがある | メンテナンスモードでデプロイ → マイグレーション → 通常のデプロイ |
| 未実行のマイグレーションがない | デプロイだけ |

### 2.2 個別に行う

デプロイだけを行う:

```bash
bin/deploy dev
```

- dev 依存を外してからデプロイし、終わると `composer install` で元に戻す
- 変更がなくても再デプロイしたいときは `bin/deploy dev --force`

初回のマイグレーション:

```bash
bin/serverless bref:cli --stage dev --args="migrate --force"
```

初回のデプロイ直後は、S3 Files のマウントがタイムアウトしてマイグレーションが失敗することがある。その場合は少し待って再実行する。

2回目以降のマイグレーションは、web 関数が書き込まないよう、メンテナンスモードの間に流す。Lambda では `artisan down` は実行した環境にしか効かないので、Bref の `MAINTENANCE_MODE`（`maintenance` パラメータ）を有効にしてデプロイする。

```bash
bin/deploy dev --param="maintenance=1"
```

```bash
bin/serverless bref:cli --stage dev --args="migrate --force"
```

```bash
bin/deploy dev
```

### 2.3 確認する

デプロイした環境に向けて E2E テストを実行する（エンドポイントはデプロイの出力の `endpoint`）。

```bash
bin/e2e https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com
```

ログを見る:

```bash
aws logs tail /aws/lambda/sample-laravel-bref-dev-web --follow --profile takyafumin --region ap-northeast-1
```

## 3. テンプレートを検証する

```bash
bin/cfn-lint dev
```

`bin/serverless package` で生成した CloudFormation テンプレートを cfn-lint で検証する。SSM と CloudFormation の参照を解決するため AWS の認証情報が必要なので、`bin/lint`（CI）には含めていない。`infra/` のテンプレートは認証情報なしで検証できるので、`bin/lint` で検証している。

## 4. 後片付け

```bash
bin/aws-remove dev
```

`bin/aws-remove` は、先に `serverless remove` でスタックを削除し、そのあとでデータベースのバケットを空にして削除する。

- **バケットをあとから消す理由:** スタックの削除中も、S3 Files が保留中の書き込みを S3 に書き出すことがある。そのためバケットは `DeletionPolicy: Retain` にして、スタックが消えてから片付けている
- **時間がかかることがある:** VPC 内の Lambda のネットワークインターフェースは、解放に数十分かかることがある。そのあいだに SSO の一時認証情報が切れると、`serverless remove` の待機だけが失敗する。削除自体は CloudFormation 側で続くので、再ログインしてもう一度実行すればよい
- **残るもの:** SSM の APP_KEY（`/sample-laravel-bref/<stage>/app-key`）と、デプロイ用のロールのスタック（`github-deploy-sample-laravel-bref`）は残る。ロールのスタックは、アプリのスタックをすべて消してから削除する（[github-actions-deploy.md の「片付け」](github-actions-deploy.md#7-片付け)）

## 5. うまくいかないとき

動作上の制約（マウントのタイムアウト、別の関数から新しいファイルが見えるまでの遅れ、S3 への反映の遅れなど）は [aws-architecture.md の「制約と既知の問題」](aws-architecture.md#8-制約と既知の問題) を、GitHub Actions からのデプロイで起きるエラーは [github-actions-deploy.md の「うまくいかないとき」](github-actions-deploy.md#6-うまくいかないとき) を参照。
