# ロリポップ！ 初期セットアップ手順

契約直後から本番公開までの作業を、実施順に並べたものです。
上から順にチェックしていけば公開まで到達します。

所要時間の目安：**2〜3時間**（DNSの浸透待ちを除く）

> **表記について**
> ロリポップのコントロールパネルはメニュー名が変わることがあります。
> 見つからない場合は、括弧内の目的で検索してください。
> 「要確認」と書いた項目は、契約プランやオプションによって挙動が変わるため、
> 実際の画面で確かめてから進めてください。

---

## 0. 事前に決めること

| 項目 | 決めた値 | 備考 |
|---|---|---|
| 公開ドメイン | **`amei-ayuko.jp`** | 決定済み。コード側の既定値も反映済み |
| 公開フォルダ名 | | 例：`amei-ayuko`。ドキュメントルートになります |
| 管理画面のユーザー名 | | 1ユーザーのみ。あとから変更可 |
| 問い合わせ受信アドレス | | 管理者通知の宛先 |

ドメインは `amei-ayuko.jp` で確定しています。コード内の既定値、`robots.txt` の
Sitemap URL、CIのフォールバック値もこの値に更新済みです。

**別のドメインに変更する場合は、以下をすべて書き換えてください。**

| 場所 | 内容 |
|---|---|
| GitHub Variables `SITE_URL` | 実行時に使われる値（最優先） |
| `_app/.env` の `SITE_URL` | PHP側（canonical・OGP・sitemap） |
| `frontend/public/robots.txt` | Sitemap行（静的ファイルのため手動） |
| `frontend/src/lib/site.ts` | 環境変数が無いときの既定値 |
| `backend/src/Config.php` | 同上（PHP側） |

---

## 1. ロリポップ側の設定

### 1-1. ドメインと公開フォルダ（サーバーの設定・管理 → 独自ドメイン設定）

1. 独自ドメインを追加し、**公開（アップロード）フォルダ**を指定します
   - 例：`amei-ayuko` → ドキュメントルートは `~/amei-ayuko/`
   - **ここで指定した名前が、あとで GitHub Secrets の `LOLIPOP_REMOTE_PATH` になります**
2. ドメインを他社で取得している場合は、ネームサーバーをロリポップに向けます
3. 反映まで最大で数時間かかります

> **公開フォルダは必ず指定してください（ホームディレクトリ直下を公開領域にしない）。**
> ホームディレクトリを直接公開すると、非公開にすべきファイルを置く場所がなくなります。

### 1-2. 独自SSL（セキュリティ → 独自SSL証明書導入）

1. 対象ドメインに **独自SSL（無料）** を設定
2. 「SSL保護有効」になるまで待つ（通常5〜30分）

サイトは全体がHTTPS前提です。`.htaccess` がHTTPへのアクセスを301でHTTPSに飛ばし、
HSTSヘッダーも送出します。**SSLが有効になる前にHSTSが効くとアクセスできなくなるため、
SSLの有効化を先に完了させてください。**

### 1-3. PHPバージョン（サーバーの設定・管理 → PHP設定）

- **PHP 8.2 以上**を選択（8.1でも動作しますが、CIは8.2で検証しています）
- 対象ドメインごとに設定が必要です

必要な拡張：`pdo_mysql` `mbstring` `gd` `json` `curl`
いずれもロリポップの標準構成に含まれています。

### 1-4. SSH（サーバーの設定・管理 → SSH）

1. SSHを**有効化**
2. 表示される **サーバー / アカウント名 / ポート番号** を控える
   - あとで `LOLIPOP_SSH_HOST` / `LOLIPOP_SSH_USER` / `LOLIPOP_SSH_PORT` になります
3. 手元で鍵ペアを作成し、**公開鍵**をコントロールパネルに登録

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/amei-deploy
# ~/.ssh/amei-deploy.pub の中身をコントロールパネルに貼り付け
```

4. 接続確認

```bash
ssh -i ~/.ssh/amei-deploy -p <ポート> <アカウント名>@<サーバー>
```

> **秘密鍵（`amei-deploy`、拡張子なしのほう）は GitHub Secrets にのみ登録し、
> リポジトリにも他人にも渡さないでください。**

### 1-5. MySQL（サーバーの設定・管理 → データベース）

1. データベースを新規作成
2. 文字コードは **utf8mb4**（照合順序 `utf8mb4_unicode_ci`）
3. 表示される以下を控える → `.env` に転記します
   - サーバー（`mysqlXXX.phy.lolipop.lan` 形式）→ `DB_HOST`
   - データベース名 → `DB_NAME`
   - ユーザー名 → `DB_USER`
   - パスワード → `DB_PASSWORD`

### 1-6. メール（メール → メール設定/ロリポップ！webメーラー）

問い合わせフォームの送信に使います。**PHPの `mail()` は使いません。**

1. 送信用のメールアカウントを作成（例：`info@amei-ayuko.jp`）
2. SMTP情報を控える

| キー | 値 |
|---|---|
| `SMTP_HOST` | `smtp.lolipop.jp` |
| `SMTP_PORT` | `587`（STARTTLS）または `465`（SSL） |
| `SMTP_USER` | 作成したメールアドレス |
| `SMTP_PASSWORD` | そのメールアカウントのパスワード |
| `MAIL_FROM_EMAIL` | 同上（差出人として表示） |

> 迷惑メール判定を減らすため、独自ドメインのアドレスを使ってください。
> Gmail等の外部アドレスを `MAIL_FROM_EMAIL` にすると、なりすまし扱いされやすくなります。

### 1-7. バックアップ（要確認）

**契約プランでデータベースのバックアップが有効かどうか、必ず確認してください。**
プランやオプションによって、バックアップが有料オプション扱いだったり、
保持期間が限られていたりします。

このプロジェクトは独自のバックアップ機構を持ちません。

| 対象 | 復旧手段 |
|---|---|
| ソースコード | GitHub |
| MySQL（お知らせ・設定） | **ロリポップのバックアップ機能のみ** |
| 商品JSON・商品画像 | minneから再同期すれば復元可能 |
| 記事画像・メインビジュアル | **ロリポップ上のファイルのみ** |

最後の2つ（`web/uploads/`）は**再生成できない唯一のデータ**です。
バックアップが有効でない場合は、定期的に手元へ控えることをおすすめします。

```bash
# 手元へ控える例
rsync -az -e "ssh -p <ポート> -i ~/.ssh/amei-deploy" \
  <アカウント>@<サーバー>:<公開フォルダ>/uploads/ ./backup-uploads/
```

---

## 2. 外部サービスの設定

### 2-1. Cloudflare Turnstile（必須）

問い合わせフォームのスパム対策です。**未設定だとフォームが送信できません**
（サーバー側で意図的に拒否します。設定漏れをスパムの入口にしないためです）。

1. https://dash.cloudflare.com/ → Turnstile → サイトを追加
2. ドメインを登録し、**Site Key** と **Secret Key** を取得
3. Site Key → GitHub Variables `TURNSTILE_SITE_KEY`（公開されて問題ない値）
4. Secret Key → サーバーの `.env` の `TURNSTILE_SECRET_KEY`（**絶対に公開しない**）

### 2-2. GA4（任意・あとからでも可）

1. Googleアナリティクスでプロパティを作成し、測定ID（`G-XXXXXXX`）を取得
2. **管理画面「サイト設定」から入力**します（`.env` ではありません）
3. 未設定の場合、GA4は一切読み込まれません

> Cookie同意前はIDを設定していてもスクリプトを読み込みません。
> 制作中の自分のアクセスは、管理画面「アクセス解析」から端末単位で除外できます。

### 2-3. Search Console（任意・公開後）

HTMLファイル方式で確認できるようにしてあります。

1. Search Console でプロパティを追加 → 「HTMLファイル」方式を選択
2. `googleXXXXXXXX.html` の **`google` を除いた部分**を、
   管理画面「サイト設定」の「Search Console 確認コード」に入力
3. Search Console 側で「確認」を実行

DNSのTXTレコード方式でも確認できます。その場合はこの設定は不要です。

---

## 3. GitHub の設定

### 3-1. Secrets（Settings → Secrets and variables → Actions → Secrets）

| 名前 | 値 |
|---|---|
| `LOLIPOP_SSH_HOST` | SSHのサーバー名 |
| `LOLIPOP_SSH_USER` | SSHのアカウント名 |
| `LOLIPOP_SSH_PORT` | SSHのポート番号 |
| `LOLIPOP_SSH_KEY` | **秘密鍵の中身**（`-----BEGIN` から `-----END` まで全部） |
| `LOLIPOP_REMOTE_PATH` | 公開フォルダの絶対パス（例：`/home/users/1/xxxx/web/amei-ayuko`） |
| `MINNE_SYNC_API_KEY` | 下記コマンドで生成した値 |

`LOLIPOP_REMOTE_PATH` はSSHでログインして `pwd` で確認できます。

### 3-2. Variables（同じ画面の Variables タブ）

| 名前 | 値 |
|---|---|
| `SITE_URL` | `https://amei-ayuko.jp`（末尾スラッシュなし） |
| `MINNE_SHOP_URL` | `https://minne.com/@amei-ayuko` |
| `TURNSTILE_SITE_KEY` | Turnstile の Site Key |

### 3-3. ブランチ保護（Settings → Branches）

`main` にルールを追加し、以下を必須にします。

- Require a pull request before merging
- Require status checks to pass before merging
  - `Frontend (lint, typecheck, build)`
  - `PHP (lint, PHPStan)`
  - `E2E (Playwright)`
  - `Dynamic SEO (render.php ↔ static export)`

---

## 4. サーバーの初期化

### 4-1. シークレットを生成

**手元で実行してください。値をチャットやIssueに貼らないこと。**

```bash
openssl rand -hex 32   # → APP_SECRET 用
openssl rand -hex 32   # → MINNE_SYNC_API_KEY 用
```

`MINNE_SYNC_API_KEY` は **GitHub Secrets とサーバーの `.env` に同じ値**を入れます。

### 4-2. ディレクトリを作成（SSH）

```bash
ssh -i ~/.ssh/amei-deploy -p <ポート> <アカウント>@<サーバー>
cd <公開フォルダ>

mkdir -p _app/storage/{logs,sync,cache/htmlpurifier}
mkdir -p data products uploads/news uploads/main-visual
chmod 755 data products uploads
chmod -R 750 _app/storage
```

### 4-3. `.env` を配置

`.env.example` をもとに作成し、`<公開フォルダ>/_app/.env` へ置きます。

```bash
# サーバー上で直接編集する場合
vi _app/.env
chmod 600 _app/.env
```

**`.env` はGitにもデプロイにも含まれません。手動配置が必要です。**
デプロイ時のrsyncは `_app/.env` を除外するので、上書きされることはありません。

### 4-4. 初回デプロイ

GitHubの **Actions → Deploy → Run workflow** を実行するか、`main` にマージします。

デプロイは以下を行います。

1. lint / typecheck / PHPStan の再実行
2. 静的出力のビルド
3. `web/` へrsync（`data/` `products/` `uploads/` `_app/.env` `_app/storage/` は除外）
4. 主要URLの疎通確認

### 4-5. マイグレーションを適用

**デプロイ時に自動適用はしません。** phpMyAdminから手動で実行します。

1. **メンテナンスモードをON**

```bash
touch <公開フォルダ>/maintenance.flag
```

2. コントロールパネル → phpMyAdmin → 対象DBを選択
3. 「SQL」タブに `backend/migrations/001_initial.sql` の内容を貼り付けて実行
4. `migration_history` テーブルに行が追加されたことを確認
5. **メンテナンスモードをOFF**

```bash
rm <公開フォルダ>/maintenance.flag
```

### 4-6. 管理者アカウントを作成

**サーバー上のSSHで実行します。**
ロリポップのMySQLホスト（`mysqlXXX.phy.lolipop.lan`）はロリポップ内部からしか
到達できないため、手元のPCからは接続できません。

```bash
ssh -i ~/.ssh/amei-deploy -p <ポート> <アカウント>@<サーバー>
cd <公開フォルダ>
php _app/ops/create-admin.php <ユーザー名>
```

パスワードは標準入力から読み取ります（引数に書くとシェル履歴と `ps` に残るため）。
**12文字以上**にしてください。

同じコマンドをもう一度実行すると**パスワードの再設定**になります。
ログイン失敗によるロックも同時に解除されます。

適用済みマイグレーションの確認も同じ場所からできます。

```bash
php _app/ops/migrate.php status
```

---

## 5. 公開前チェックリスト

### 動作確認

- [ ] `https://amei-ayuko.jp/` が表示される（HTTPでアクセスするとHTTPSへ301）
- [ ] オープニングアニメーションが再生され、1.35秒後にヒーローが見える
- [ ] `/shop/` でタブが切り替わる（商品は同期前なので0件でOK）
- [ ] `/news/` `/about/` `/contact/` `/privacy-policy/` が表示される
- [ ] 存在しないURLで**404が返る**（ブラウザの開発者ツールで確認）
- [ ] `/admin/` にログインできる
- [ ] 管理画面「サイト設定」を保存し、フッターに反映される
- [ ] メインビジュアルをアップロードし、TOPに反映される
- [ ] お知らせを1件作成・公開し、`/news/` と `/news/{id}` に出る
- [ ] 問い合わせフォームを送信し、**管理者通知と自動返信の両方**が届く

### minne同期

- [ ] Actions → minne sync → Run workflow（`dry_run` にチェック）で成功する
- [ ] 続いて `dry_run` なしで実行し、`/shop/` に商品が並ぶ
- [ ] 管理画面「Shop Sync Status」に履歴が記録される
- [ ] 未分類の商品があれば、カテゴリを設定する

### SEO

- [ ] `https://amei-ayuko.jp/sitemap.xml` が生成される
- [ ] `https://amei-ayuko.jp/robots.txt` が返る
- [ ] 商品URL（`/shop/?category=...&product=...`）のソースに
      商品名のtitleと Product JSON-LD が入っている
- [ ] `/news/{id}` のソースに記事のtitleと NewsArticle JSON-LD が入っている

```bash
# コマンドで確認する例
curl -s "https://amei-ayuko.jp/shop/?category=album-flake&product=<商品ID>" \
  | grep -oE "<title>[^<]*|\"@type\":\"Product\""
```

- [ ] リッチリザルトテスト（https://search.google.com/test/rich-results）で
      商品ページの構造化データがエラーなく認識される

### 最終確認

- [ ] `frontend/public/brand/` のプレースホルダーを実素材に差し替えた
- [ ] `tokens.css` のブランドカラーを実ロゴに合わせた
- [ ] `SITE_URL` と Instagram URL が実際の値になっている
- [ ] ロリポップのバックアップ対象と保持期間を確認した

---

## 補足：`_app/` をドキュメントルートの外へ置く

現状の構成では、非公開ファイル（ソース・`.env`・ログ）は
ドキュメントルート内の `_app/` に置き、`.htaccess` で二重にブロックしています。

```
web/amei-ayuko/          ← ドキュメントルート
  ├─ index.html …
  └─ _app/               ← Require all denied + RewriteRule ^_app/ - [F,L]
```

**より強固にしたい場合**、`_app/` をドキュメントルートの外へ移せます。

```
web/
  ├─ amei-ayuko/         ← ドキュメントルート
  └─ amei-app/           ← Webから到達不能
```

この場合、PHPの各エントリポイントが参照するパスと `deploy.yml` の転送先を
変更する必要があります。`bootstrap.php` は `AMEI_APP_DIR` /
`AMEI_WEB_ROOT` 環境変数でパスを上書きできるよう作ってあるので、
対応は可能です。**希望する場合は対応しますので、お知らせください。**

現状の `.htaccess` によるブロックでも、共有レンタルサーバーでは
一般的かつ十分な対策です。

---

## 困ったとき

- 500エラー → `<公開フォルダ>/_app/storage/logs/app-YYYY-MM-DD.log`
- PHPのエラーログ → コントロールパネルから確認
- その他 → [README のトラブルシューティング](../README.md#troubleshooting)
