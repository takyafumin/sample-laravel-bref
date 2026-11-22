# コード品質チェック

変更はすべて、フォーマッタと linter のチェックを通すこと（必須）。CI（[.github/workflows/ci.yml](../.github/workflows/ci.yml)）でも PR ごとに同じチェックが走る。

## 1. 実行する

チェックだけを行う:

```bash
composer lint
```

自動で直せるもの（Pint、Prettier）を直してから、チェックする:

```bash
composer lint:fix
```

中身は [bin/lint](../bin/lint)（`bin/lint`、`bin/lint --fix`）。

## 2. チェックの内容

| 対象 | ツール |
|---|---|
| クレデンシャルの混入 | gitleaks（コミット履歴、未コミットの変更、ステージ済みの変更） |
| PHP | Pint（フォーマット）、Larastan / PHPStan level max（静的解析） |
| JavaScript / TypeScript / JSON（gateway、E2E テスト） | Prettier |
| シェルスクリプト（`bin/`） | ShellCheck |
| Dockerfile | Hadolint |
| compose.yaml | `docker compose config` |
| CloudFormation（`infra/`） | cfn-lint |
| GitHub Actions | actionlint |

- PHP 以外のツールは Docker で動かすので、ホストの Node.js のバージョンには依存しない
- gitleaks は、まだステージしていない新しいファイルは見ない。ステージすると対象になる
- アプリのスタックのテンプレート（serverless.yml から生成するもの）は、AWS の認証情報が要るので `bin/lint` には含めず、`bin/cfn-lint` で検証する（[aws-deploy.md](aws-deploy.md#3-テンプレートを検証する)）
