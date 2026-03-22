# BLSE v2 — セットアップ手順

## 1. Google Sheets を手動作成

1. Blue Life用Gmailで新規スプレッドシートを作成
2. GASエディタを開く（拡張機能 → Apps Script）
3. `gas/sheets_setup.gs` の内容を貼り付けて `setupSheets()` を実行
4. 8シートとヘッダーが自動作成される

## 2. config.js を作成

```
cp blse/config.example.js blse/config.js
```

config.js に以下を入力:
- `PLACES_API_KEY` — GCP Console で取得（HTTPリファラー制限：`*.github.io/*`）
- `SPREADSHEET_ID` — スプシURLの `/d/{ID}/` 部分
- `OAUTH_CLIENT_ID` — GCP Console OAuth2クライアントID
- `GAS_EMAIL_URL` — GASデプロイURL（手順3完了後に設定）
- `DISCORD_WEBHOOK_ALERTS` — （任意）API遅延監視通知先（N2機能）

## 3. GAS をデプロイ

1. `gas/send_email.gs` を新しいGASプロジェクトに貼り付け
2. `gas/inbox_monitor.gs` を同じプロジェクトに追加
3. スクリプトプロパティを設定:
   - `GAS_SECRET` = ランダム文字列（config.jsと同じ）
   - `SPREADSHEET_ID` = スプシID
   - `DISCORD_WEBHOOK` = Discord Webhook URL（必須・全通知のフォールバック）
   - `DISCORD_WEBHOOK_ALERTS` = #blse-alerts 用 Webhook（任意・上限/エラー通知）
   - `DISCORD_WEBHOOK_LOGS` = #blse-logs 用 Webhook（任意・返信検知ログ）
   - `DISCORD_WEBHOOK_DAILY` = #blse-daily 用 Webhook（任意・日次サマリー）
4. ウェブアプリとしてデプロイ（実行: 自分として / アクセス: 自分のみ）
5. デプロイURLを `config.js` の `GAS_EMAIL_URL` に設定
6. `checkInbox` に5分間隔のトリガーを設定

## 4. Python デーモンを M（Mother-Ship）で起動

```
# サービスアカウントキーを配置
cp YOUR_SERVICE_ACCOUNT.json blse-backend/config/service_account.json

# 環境変数を設定
set BLSE_SHEET_ID=スプレッドシートID
set BLSE_DISCORD=DiscordWebhookURL

# 起動（DEV_BLSE_DAEMON タイトルで）
start "DEV_BLSE_DAEMON" cmd /k "cd /d C:\path\to\blse-backend && python daemon/detector_daemon.py"
```

## 5. フロントエンドを起動

```
cd blse
python -m http.server 8888
```

ブラウザで `http://localhost:8888/search.html` を開く

## .gitignore

```
blse/config.js
blse-backend/config/service_account.json
blse-backend/logs/
blse-backend/data/
```

## 6. Gemini AIフォールバック（任意）

フォーム送信がPlaywrightで失敗したとき、Gemini Visionが画面を認識して自動送信します。

```
# blse-backend/config/.env に追記
GEMINI_API_KEY=AIza...（Google AI Studio で取得）
```

取得先: [https://aistudio.google.com](https://aistudio.google.com) → "Get API key"

---

## 7. 本番デプロイ（GitHub Pages + Cloudflare Access）

### ⚠️ 注意：config.js は .gitignore 対象。GitHub に push しないこと。

### 7-1. GitHub Pages にデプロイ

```bash
# blse/ 配下を GitHub リポジトリに push（config.js 以外）
git init
git add .
git commit -m "BLSE v2 deploy"
git remote add origin https://github.com/あなたのID/blse.git
git push -u origin main

# GitHub Settings → Pages → Source: main / root
# → https://あなたのID.github.io/blse/ でアクセス可能
```

### 7-2. Cloudflare Access で認証ゲートを張る（必須）

Pages を外部公開するとスプシデータが見える。Cloudflare Access で自分のメールにのみアクセス許可:

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) にログイン
2. **Access → Applications → "Add an application"**
3. 種別: **Self-hosted**
4. Application domain: `あなたのID.github.io`（またはサブパス `/blse/`）
5. **Policy → Include → Emails → `bluelife.aoki@gmail.com`** を登録
6. Save → アクセス時にCloudflareのメール認証が走るようになる

### 7-3. GCP の HTTPリファラー制限を更新

```
本番URL: https://あなたのID.github.io/blse/*
```

GCP Console → 認証情報 → Places API キー → HTTPリファラー → 上記URLを追加

