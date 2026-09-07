# amei ayuko 公式サイト

3児のママでありイラストレーターの **amei ayuko** のブランドサイトです。
手描きのアルバムフレーク・ラバースタンプの紹介、minneへの送客、
お知らせの配信、デザイン制作のお問い合わせを担います。

---

## 目次

- [Architecture](#architecture)
- [Requirement](#requirement)
- [ディレクトリ構成](#ディレクトリ構成)
- [Local Setup](#local-setup)
- [Environment Variables](#environment-variables)
- [MySQL Setup](#mysql-setup)
- [Migration](#migration)
- [Development](#development)
- [Build / Static Export](#build--static-export)
- [PHP Setup](#php-setup)
- [minne Sync](#minne-sync)
- [GitHub Actions](#github-actions)
- [Deployment](#deployment)
- [Maintenance Mode](#maintenance-mode)
- [Admin Password Reset](#admin-password-reset)
- [Backup](#backup)
- [Troubleshooting](#troubleshooting)

---

## Architecture

ロリポップ！ハイスピードプランは **Node.jsのサーバープロセスを常駐できません**。
そのため、フロントエンドは Next.js の静的出力（Static Export）とし、
動的処理はすべて PHP が担当します。Server Actions は本番では使いません。

```
┌──────────────┐   毎日 00:00 JST / 手動実行
│    minne     │◀──────────────────────────────┐
└──────┬───────┘                               │
       │ scrape (JSON-LD / __NEXT_DATA__)      │
       ▼                                        │
┌────────────────────────┐              ┌──────┴───────────┐
│  GitHub Actions        │  画像をDL     │ scraper/         │
│  (minne-sync.yml)      │──WebP変換────▶│ Node + sharp     │
└──────────┬─────────────┘              └──────────────────┘
           │ Bearer認証つき HTTPS
           │ start → products → image×N → commit
           ▼
╔══════════════════════════ ロリポップ！ ══════════════════════════╗
║                                                                  ║
║  web/                    ← ドキュメントルート                     ║
║   ├─ index.html …        Next.js Static Export（UIそのもの）      ║
║   ├─ api/                PHP API                                 ║
║   │   ├─ settings.php / news/ / contact.php                      ║
║   │   └─ sync/{start,products,image,commit,abort}.php            ║
║   ├─ admin/              PHP管理画面（Session認証）               ║
║   ├─ render.php          動的SEO（/news/{id}・/shop?product=）    ║
║   ├─ sitemap.php         sitemap.xml を生成                      ║
║   ├─ data/products.json  商品データ（同期がAtomicに差し替え）      ║
║   ├─ products/{id}/      商品画像（WebP 2サイズ）                 ║
║   ├─ uploads/            記事画像・メインビジュアル                ║
║   └─ _app/               ★Web非公開（.htaccessでdeny）            ║
║        ├─ bootstrap.php / src/ / vendor/ / templates/            ║
║        ├─ .env           秘匿情報                                 ║
║        └─ storage/       logs / sync一時領域 / cache             ║
║                                                                  ║
║  MySQL … News / 設定 / 管理者 / 同期履歴 / カテゴリOverride        ║
╚══════════════════════════════════════════════════════════════════╝
```

### 設計上の要点

**1. 静的出力でも商品・記事ページのSEOが成立する**

Static Export は `/news/{id}` のような未知のURLを事前生成できません。
そこで Apache が該当URLを `render.php` へ回し、PHPが
**書き出し済みのHTMLシェルの `<head>` だけを差し替えて** 返します。

- `/news/123` → `news/detail/index.html` を土台に、記事のtitle・description・
  canonical・OGP・NewsArticle/BreadcrumbList JSON-LD を注入
- `/shop/?category=…&product=123` → `shop/index.html` を土台に、商品の
  title・description・canonical・OGP・Product/BreadcrumbList JSON-LD を注入
- どちらも `<noscript>` に本文相当のテキストを出力
- 存在しないIDは **本物の404** を返します（ソフト404にしません）

ユーザーが見るUIは Next.js のまま変わりません。

**2. 本番データを途中状態にしない**

minne同期は「一時領域に全部そろえてから、検証を通ったものだけを
`rename()` で一気に差し替える」方式です。検証に落ちた場合、本番は
**前回成功時のデータのまま**変わりません。

**3. 秘匿情報をフロントに含めない**

`NEXT_PUBLIC_*` は必ずバンドルに埋め込まれます。SMTPパスワード、
Sync API Key、Turnstile Secret は PHP 側（`_app/.env`）だけが持ちます。

**4. オープニングアニメーションがLCPを悪化させない**

TOPページの初回表示時に、ロゴと手描きラインのオープニングを約1.35秒再生します。
ここで重要なのは **ヒーローの描画をいっさい遅らせていない** ことです。

- Chromeは「他の要素に覆われている」ことではLCP候補から除外しません
  （除外されるのは `opacity: 0` の場合）。したがってヒーローは通常どおり
  描画され、オーバーレイの下でLCPとして計測されます
- 逆に「オープニング後にヒーローをフェードインさせる」実装にすると、
  LCPがアニメーション終了後までずれ込みます。そのため
  **ヒーローには一切のフェード演出を入れていません**（E2Eで固定しています）
- 終了処理はCSSアニメーションの最終キーフレーム（`visibility: hidden` ＋
  `forwards`）が行うため、**JSが失敗しても画面が覆われたままになりません**
- 表示するかどうかの判定だけを `<head>` のインラインスクリプトが行います
  （TOPページのみ・1セッション1回）。判定を先に済ませるので再訪時に
  一瞬ちらつくこともありません
- `prefers-reduced-motion: reduce` では完全に無効化します
- `aria-hidden` ＋ `inert` により、支援技術とキーボード操作からは
  最初から存在しません

再生時間は `frontend/src/styles/intro.css` 冒頭のタイムラインコメントに
まとめてあります。短くしたい場合はそこの数値だけを調整してください。

**5. 個人情報を溜めない**

お問い合わせ本文・メールアドレスはメールで届くだけで、
**MySQLには保存しません**。レート制限用テーブルが持つのはハッシュのみです。

---

## Requirement

| | バージョン | 用途 |
|---|---|---|
| Node.js | 20.11 以上 | フロントエンドのビルド、スクレイパー |
| PHP | 8.2 以上（**本番は 8.5**） | API・管理画面 |
| MySQL | 5.7 以上 / MariaDB 10.4 以上 | News・設定・同期履歴 |
| Composer | 2.x | PHP依存パッケージ |

PHP拡張：`pdo_mysql` `mbstring` `gd` `json` `curl`

ロリポップ！ハイスピードプランは上記をすべて満たします
（PHPのバージョンはコントロールパネルから指定してください）。

### Browser Support

Chrome / Edge / Safari / Firefox の最新2バージョン、iOS Safari、Android Chrome。
IEは対象外です。

---

## ディレクトリ構成

```
/
├─ frontend/          Next.js（App Router / TypeScript / Static Export）
│   ├─ src/app/       ルーティング
│   ├─ src/components/
│   ├─ src/lib/       API client, analytics, consent, hooks
│   ├─ src/styles/    tokens → base → layout → components → sections
│   └─ public/brand/  ロゴ・イラスト（すべて差し替え前提のプレースホルダー）
│
├─ backend/
│   ├─ bootstrap.php  ★デプロイ先では web/_app/bootstrap.php
│   ├─ src/           Amei\ 名前空間（PSR-4）
│   ├─ public/        ★デプロイ先では web/ 直下
│   │   ├─ .htaccess  セキュリティヘッダ・rewrite・キャッシュ
│   │   ├─ api/ admin/ render.php sitemap.php verify.php
│   ├─ templates/mail/ 自動返信・管理者通知
│   └─ migrations/    SQLマイグレーション（手動適用）
│
├─ scraper/           minne同期（Node + cheerio + sharp + undici）
├─ e2e/               Playwright
├─ ops/               管理者作成・マイグレーション確認・ローカルサーバー
└─ .github/workflows/ ci.yml / deploy.yml / minne-sync.yml
```

> **リポジトリの構成とデプロイ後の構成は同じではありません。**
> `backend/public/` が `web/`、`backend/`（`src` `vendor` `templates` `.env`）が
> `web/_app/` に対応します。`ops/dev-server.sh` はこの対応関係を
> ローカルに再現します。

---

## Local Setup

```bash
git clone https://github.com/YutaIshibashi/amei-ayuko.git
cd amei-ayuko

# フロントエンド
cd frontend && npm install && cd ..

# バックエンド
cd backend && composer install && cd ..

# スクレイパー / E2E（必要なときだけ）
cd scraper && npm install && cd ..
cd e2e && npm install && npx playwright install --with-deps chromium webkit && cd ..

# 環境変数
cp .env.example backend/.env          # PHP側（秘匿情報）
cp frontend/.env.example frontend/.env.local   # フロント側（公開値のみ）
```

---

## Environment Variables

### backend/.env（本番では `web/_app/.env`、パーミッション600）

`.env.example` に全項目のひな形があります。とくに重要なもの：

| 変数 | 説明 |
|---|---|
| `APP_SECRET` | IPハッシュ・重複判定のソルト。`openssl rand -hex 32` |
| `DB_*` | ロリポップのコントロールパネル「データベース」に表示される値 |
| `ADMIN_EMAIL` | 管理者通知の宛先（管理画面の設定が優先されます） |
| `SMTP_*` | ロリポップSMTP。`mail()` は使いません |
| `MINNE_SYNC_API_KEY` | GitHub Secrets と同じ値。`openssl rand -hex 32` |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile の Secret Key |
| `TRUSTED_PROXY` | ロリポップでは `false` のままにしてください |

> `TRUSTED_PROXY=true` は、Apacheの前段に信頼できるプロキシがある場合のみ
> 有効にします。そうでない環境で有効にすると、`X-Forwarded-For` を
> 自称するだけでお問い合わせのレート制限を回避できてしまいます。

### frontend/.env.local（公開値のみ）

```
NEXT_PUBLIC_SITE_URL=https://amei-ayuko.com
NEXT_PUBLIC_API_BASE=/api
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAA…      # Site Key（公開されて問題ない値）
```

**`NEXT_PUBLIC_*` は必ずJSバンドルに埋め込まれます。秘密の値は絶対に置かないでください。**

### GitHub の Secrets / Variables

| 種別 | 名前 | 用途 |
|---|---|---|
| Secret | `MINNE_SYNC_API_KEY` | 同期APIのBearerトークン |
| Secret | `LOLIPOP_SSH_KEY` | デプロイ用の秘密鍵（ed25519） |
| Secret | `LOLIPOP_SSH_HOST` / `LOLIPOP_SSH_USER` / `LOLIPOP_SSH_PORT` | SSH接続情報 |
| Secret | `LOLIPOP_REMOTE_PATH` | 例：`/home/users/1/xxxx/web` |
| Variable | `SITE_URL` | 例：`https://amei-ayuko.com` |
| Variable | `MINNE_SHOP_URL` | 例：`https://minne.com/@amei-ayuko` |
| Variable | `TURNSTILE_SITE_KEY` | ビルド時に埋め込むSite Key |

---

## MySQL Setup

1. ロリポップのコントロールパネル →「データベース」で新規作成
2. 文字コードは **utf8mb4**（照合順序 `utf8mb4_unicode_ci`）
3. 表示されたホスト名・DB名・ユーザー名・パスワードを `.env` に転記

---

## Migration

マイグレーションはSQLファイルとしてGit管理し、**本番へは手動で適用します**。
デプロイ時に自動適用は行いません（スキーマ変更が意図せず走らないため）。

```
backend/migrations/
├─ 001_initial.sql             ← 適用するファイル
└─ 001_initial.rollback.sql    ← 破壊的変更にはRollbackも用意
```

### 適用手順（本番）

1. **メンテナンスモードをON**（下記参照）
2. 念のためロリポップのバックアップ機能で現在のDBを取得
3. phpMyAdmin を開き、対象データベースを選択
4. 「SQL」タブに `.sql` の内容を貼り付けて実行
5. `migration_history` テーブルに行が追加されたことを確認
6. サイトの表示・管理画面を確認し、**メンテナンスモードをOFF**

### 適用状況の確認

```bash
php ops/migrate.php status      # applied / PENDING を一覧
php ops/migrate.php up          # ローカル専用（本番では実行を拒否します）
```

### 新しいマイグレーションを追加するとき

- 連番＋内容がわかる名前（`002_add_news_tag.sql`）
- 末尾に `INSERT INTO migration_history (migration_name) VALUES ('002_….sql');`
- 列追加のような可逆・非破壊な変更は Forward Only で構いません
- 列削除・テーブル削除・型変更など破壊的な変更は `*.rollback.sql` も用意

---

## Development

### フロントエンドだけを触るとき

```bash
cd frontend
npm run dev            # http://localhost:3000
```

APIはローカルに存在しないため、お知らせ・商品・設定は
フォールバック表示になります。UIの調整はこれで十分です。

### PHPも含めて通しで動かすとき

```bash
cd frontend && npm run build && cd ..   # まず静的出力を作る
./ops/dev-server.sh                     # http://localhost:8080
```

`.dev-root/` に本番と同じ配置（`web/` と `web/_app/`）をシンボリックリンクで
再現し、PHPビルトインサーバーを起動します。`ops/router.php` が
`.htaccess` の主要なrewrite（`/news/{id}`、`/shop/?product=`、`/sitemap.xml`）を
再現します。

### 品質チェック

```bash
cd frontend && npm run lint && npm run typecheck
cd backend  && composer lint && vendor/bin/phpstan analyse --memory-limit=1G
cd scraper  && npm run typecheck
cd e2e      && npm test
```

---

## Build / Static Export

```bash
cd frontend
npm run build      # next build（output: 'export'）
```

`frontend/out/` に静的ファイル一式が出力されます。`next export` コマンドは
不要です（`next.config.mjs` の `output: 'export'` によりビルドと同時に出力されます）。

主な出力：

```
out/
├─ index.html                 TOP
├─ 404.html                   404（ErrorDocumentで使用）
├─ shop/index.html            Online Shop ＝ 商品モーダルのシェル
├─ news/index.html            News一覧
├─ news/detail/index.html     /news/{id} のシェル（render.phpが使用）
├─ about/ contact/ contact/thanks/ privacy-policy/ maintenance/
└─ _next/static/…             ハッシュ付きJS/CSS（1年キャッシュ）
```

> `frontend/public/data/products.json` は**開発用のダミーです**。
> デプロイ時は `data/` を除外し、本番の商品データを上書きしません。

---

## PHP Setup

デプロイ後のサーバー側の配置は次のとおりです（`deploy.yml` が自動で行います）。

```
web/
├─ (静的出力)  ・ api/ ・ admin/ ・ render.php ・ .htaccess …
├─ data/          755  商品JSON（同期が書き込む）
├─ products/      755  商品画像
├─ uploads/       755  記事画像・メインビジュアル
└─ _app/          Web非公開
    ├─ .env       600  ★手動で配置（Gitにもデプロイにも含めません）
    └─ storage/   750  logs / sync / cache
```

初回のみ手動で行うこと：

1. `.env.example` をもとに `web/_app/.env` を作成（`chmod 600`）
2. `php ops/create-admin.php <ユーザー名>` で管理者を作成
   （SSHでサーバー上で実行するか、同じDBに対してローカルから実行）
3. `/admin/` にログインし、「サイト設定」「お問い合わせ設定」を入力
4. 「メインビジュアル」から画像をアップロード

`_app/` は `.htaccess` の `RewriteRule ^_app/ - [F,L]` と
`_app/.htaccess` の `Require all denied` で二重にブロックしています。
より強固にしたい場合は `_app/` をドキュメントルートの外へ移し、
`AMEI_APP_DIR` 環境変数でパスを指定してください。

---

## minne Sync

### 流れ

```
1. start.php     同期セッションを開始（sync_id を発行）
2. products.php  商品JSONを送信 → 自動カテゴリ分類 → 一時領域へ
3. image.php     WebP画像を1枚ずつ送信 → 一時領域へ
4. commit.php    検証 → 画像を本番へ移動 → products.json をAtomicに差し替え
                 → 消えた商品の画像を削除 → 履歴を記録 → 一時領域を削除
```

### 検証項目（ひとつでも該当すれば公開データを更新しません）

- 商品が0件
- 前回比で商品数が30%以上減少
- 必須フィールド（id / name / price / url / category / images）の欠落
- JSONが不正
- メイン画像の取得失敗が1件でもある
- 全画像の取得成功率が95%未満
- PHP側の保存失敗

失敗時は `sync_sessions` に `failed` として記録し、
GitHub Actionsを失敗させ、管理者宛に通知メールを送ります。
**本番の商品データは前回成功時のまま**です。

### 相手サービスへの配慮

- 商品ページの取得間隔：約1秒
- 画像ダウンロードの同時実行：最大3
- タイムアウト：60秒
- リトライ：最大3回、2秒 → 5秒 → 10秒（ジッターあり）
- 4xxは再試行しません（それは「答え」であって失敗ではないため）

### 商品カテゴリ

`Album Flake` と `Stamp` の2つ固定です。商品名・説明文のキーワードで
自動分類し、**判定できなかった商品は公開サイトに出しません**。
管理画面「Shop Sync Status」の未分類一覧に表示され、管理者へメール通知します。
管理画面から手動でカテゴリを設定すると、以降の同期でもその設定が優先されます。

### 手動実行

GitHubの **Actions → minne sync → Run workflow**。
プレビュー確認はありません。検証を通過すれば即時反映されます。
`dry_run` を有効にすると、取得と変換だけを行い公開データは触りません。

### ローカルでの動作確認

```bash
cd scraper
MAX_LIST_PAGES=1 npm run sync -- --dry-run --limit 3
```

---

## GitHub Actions

| ワークフロー | 契機 | 内容 |
|---|---|---|
| `ci.yml` | Pull Request / mainへのpush | lint・typecheck・build・`php -l`・PHPStan（**PHP 8.2 と 8.5 の両方**）・ランタイム互換チェック・動的SEO・E2E |
| `deploy.yml` | mainへのpush / 手動 | 再チェック → ビルド → rsync → 疎通確認 |
| `minne-sync.yml` | 毎日15:00 UTC（00:00 JST）/ 手動 | minne同期 |

### 運用ルール

- **mainへの直接pushはしません。** 必ずPull Requestを経由します。
- GitHubの Settings → Branches で `main` に保護ルールを設定し、
  「Require status checks to pass before merging」で
  `Frontend (lint, typecheck, build)` `PHP 8.2 (lint, PHPStan)`
  `PHP 8.5 (lint, PHPStan)` `E2E (Playwright)`
  `Dynamic SEO (render.php ↔ static export)` を必須にしてください
  （この設定はリポジトリ側の操作が必要です）。
- Playwrightの失敗時は Screenshot / Video / Trace / HTMLレポートが
  Artifactとして7日間保存されます。

---

## Deployment

`main` にマージされると `deploy.yml` が実行されます。

1. Frontend Check（lint / typecheck）
2. PHP Check（`php -l` / PHPStan）
3. Frontend Build ＋ Static Export
4. リリースディレクトリの組み立て（静的出力 ＋ public PHP ＋ `_app/`）
5. rsync でロリポップへ転送
6. 主要URLの疎通確認（200 または 503 以外なら失敗）

転送時に**除外**するもの（サーバー側の実データを壊さないため）:

```
/data/  /products/  /uploads/  /maintenance.flag  /_app/.env  /_app/storage/
```

### 失敗したとき

- Actionsが失敗し、可能な限り既存の本番環境が維持されます
- 再実行は手動（**Re-run jobs**）です
- 初期リリースでは自動ロールバック／リリースディレクトリ方式は導入していません

### SSH鍵の準備

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy_key
# deploy_key.pub をロリポップのコントロールパネル「SSH」に登録
# deploy_key（秘密鍵）を GitHub Secrets の LOLIPOP_SSH_KEY に登録
rm deploy_key deploy_key.pub    # ローカルには残さない
```

---

## Maintenance Mode

DBマイグレーションなど、**データベースを触る作業のときだけ**使います。

### ON にする

```bash
# SSH または FTP で、ドキュメントルート直下にファイルを置くだけ
touch ~/web/maintenance.flag
```

### OFF にする

```bash
rm ~/web/maintenance.flag
```

### モード中の挙動

| 対象 | 挙動 |
|---|---|
| 公開サイト | ブランドデザインのメンテナンスページ（**HTTP 503**） |
| 管理画面 `/admin/` | 通常どおり利用できます |
| お問い合わせAPI | 503。フォームはInstagram DMへの代替導線を表示します |
| Shop Sync | 503。GitHub Actionsは失敗し、管理者へ通知メール |

メンテナンス終了後にShop Syncが自動で走ることはありません。
必要なら Actions から手動実行してください。

---

## Admin Password Reset

管理者は1ユーザーのみ、パスワードリセットUIはありません。
忘れた場合は開発者が再設定します。

```bash
# サーバー上（推奨）、または同じDBに接続できるローカルから
php ops/create-admin.php <ユーザー名>
# パスワードは標準入力から読み取ります（引数に書くとシェル履歴に残るため）
```

既存ユーザー名を指定するとパスワードのみ更新し、ログイン失敗回数の
ロックも同時に解除します。

ログイン試行は **5回失敗で15分ロック**、判定はIPとアカウントの両方を見ます。

---

## Backup

独自のバックアップ機構は構築していません。

| 対象 | 方法 |
|---|---|
| ソースコード | GitHub |
| MySQL | **ロリポップのバックアップ機能** |
| 商品JSON / 商品画像 | ロリポップ上の最新データ（minneから再生成可能） |
| 記事画像・メインビジュアル | ロリポップ上のファイル |

> **本番運用の開始前に、ロリポップのバックアップ対象と保持期間を
> 必ずご確認ください。** プランやオプションによって、
> データベースのバックアップが有料オプション扱いだったり、
> 保持期間が限られていたりします。
> 記事画像とメインビジュアルは再生成できない唯一のデータなので、
> `web/uploads/` は定期的に手元へ控えておくことをおすすめします。

---

## Troubleshooting

### 商品が表示されない / 古いまま

1. 管理画面「Shop Sync Status」で直近の同期結果を確認
2. `failed` の場合はエラー概要を確認（本番データは前回成功時のままです）
3. 商品が「未分類」になっていないか確認。未分類の商品は公開されません
4. `web/data/products.json` の更新日時を確認
5. ブラウザのキャッシュ（`products.json` は最大60秒）

### お問い合わせが送信できない

| 症状 | 確認すること |
|---|---|
| 「スパム対策の確認に失敗しました」 | Turnstile の Site Key / Secret Key の組み合わせ |
| 「セッションの有効期限が切れました」 | 時間経過によるCSRFトークン失効。再読み込みで解消 |
| 「短時間に複数回送信されています」 | 同一IPからの1分あたり1件の制限 |
| 何も届かない | `_app/storage/logs/app-YYYY-MM-DD.log` の `contact` チャンネル |
| 自動返信だけ届かない | 管理者宛は届いています。SMTP設定と迷惑メールフォルダを確認 |

### 管理画面にログインできない

- 5回失敗すると15分ロックされます。時間をおいてください
- パスワードは `ops/create-admin.php` で再設定できます
- 「セッションエラー」が出る場合はCookieがブロックされていないか確認

### `/news/{id}` が404になる

- 記事のステータスが「公開」で、公開日時が過去になっているか
- `.htaccess` が転送されているか（rsyncは隠しファイルも送ります）
- `web/news/detail/index.html` が存在するか（静的出力の欠落）

### 画像がアップロードできない

- 対応形式：JPEG / PNG / WebP / GIF、最大12MB
- `web/uploads/` の書き込み権限（755）
- PHPの `upload_max_filesize` / `post_max_size`（ロリポップのPHP設定）
- GD拡張が有効か

### メンテナンスページが解除されない

- `web/maintenance.flag` が残っていないか
- ブラウザキャッシュ（503は `no-store` なので通常は残りません）

### ログの場所

```
_app/storage/logs/app-YYYY-MM-DD.log     独自アプリケーションログ（90日で自動削除）
```

パスワード・APIキー・お問い合わせ本文は**記録されません**。
PHP本体のエラーログはロリポップのコントロールパネルから確認できます。

---

## ライセンス / 素材について

このリポジトリはamei ayukoの専有物です。

`frontend/public/brand/` のロゴ・イラストは**すべてプレースホルダー**です。
実素材が用意でき次第、**ファイル名を変えずに差し替えてください**。
参照箇所は `frontend/src/lib/site.ts` の `ASSETS` に集約されています。
詳細は [`frontend/public/brand/README.md`](frontend/public/brand/README.md) を参照してください。
