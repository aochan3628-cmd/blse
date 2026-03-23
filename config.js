/**
 * BLSE v2 — 設定ローダー
 * セッショントークンで認証済みの場合のみconfigをlocalStorageから読み込む。
 * 未認証の場合はlogin.htmlへリダイレクト。
 */
(function () {
  const saved = JSON.parse(localStorage.getItem('BLSE_CONFIG') || '{}');
  const session = localStorage.getItem('BLSE_SESSION');

  window.CONFIG = {
    PLACES_API_KEY: saved.PLACES_API_KEY || '',
    SPREADSHEET_ID: saved.SPREADSHEET_ID || '',
    GAS_EMAIL_URL: saved.GAS_EMAIL_URL || '',
    GAS_SECRET: saved.GAS_SECRET || '',
    OAUTH_CLIENT_ID: '95449188194-ce0j9pbehfn5712o04evdb1kegp98mr5.apps.googleusercontent.com',
    FLASK_BACKEND_URL: saved.FLASK_BACKEND_URL || 'http://192.168.1.233:5001',
    DISCORD_WEBHOOK_ALERTS: '', // 無効化済み

    SHEETS: {
      INBOX: '★受信',               // 全件一時受け入れ
      UNCHECKED_EMAIL: '未チェック（メール）',   // HP有り・メールあり
      UNCHECKED_FORM: '未チェック（フォーム）', // HP有り・フォームのみ
      SNS_ONLY: 'SNSのみ',
      NONE: 'なし',
      EXCLUDED: '除外',                 // スコア低い・却下
      CHECKED_EMAIL: 'チェック済み（メール）',
      CHECKED_FORM: 'チェック済み（フォーム）',
      SENT: '送信済み',
      // 後方互換エイリアス
      UNCHECKED_HP: '未チェック（メール）',
      PW_WAITING: 'Playwright失敗待ち',
      UNSENDABLE: '送信不可',
    }
  };

  // login.html自体とコールバックは除外
  const path = location.pathname;
  const isLoginPage = path.endsWith('login.html');

  if (!isLoginPage && (!session || !window.CONFIG.GAS_EMAIL_URL)) {
    const back = encodeURIComponent(location.href);
    location.replace('./login.html?back=' + back);
  }
})();
