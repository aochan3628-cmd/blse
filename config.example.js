/**
 * BLSE v2 — 設定テンプレ
 * ⚠️ このファイルをコピーして config.js にリネームし、実際の値を入力すること
 * config.js は .gitignore に追加すること
 */
const CONFIG = {
    PLACES_API_KEY: 'AIza...',         // GCP Console → APIキー（HTTPリファラー制限をかけること）
    SPREADSHEET_ID: '1BxiM...',        // スプシURLの /d/{ID}/ 部分
    GAS_EMAIL_URL: 'https://script.google.com/macros/s/.../exec',
    GAS_SECRET: 'ランダムな文字列',
    OAUTH_CLIENT_ID: '000000.apps.googleusercontent.com',

    // blse-backend Flaskサーバー（Mで起動）
    FLASK_BACKEND_URL: 'http://192.168.1.233:5001',  // MのLAN IP + port

    // Discord遅延監視通知先（N2機能・任意）
    DISCORD_WEBHOOK_ALERTS: '',

    SHEETS: {
        UNCHECKED_HP: '未チェック（HP有り）',
        UNCHECKED_SNS: '未チェック（SNSのみ）',
        UNCHECKED_NONE: '未チェック（なし）',
        CHECKED_EMAIL: 'チェック済み（メール）',
        CHECKED_FORM: 'チェック済み（フォーム）',
        SENT: '送信済み',
        PW_WAITING: 'Playwright失敗待ち',
        UNSENDABLE: '送信不可',
    }
};
