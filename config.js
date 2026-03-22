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
    DISCORD_WEBHOOK_ALERTS: saved.DISCORD_WEBHOOK_ALERTS || '',

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

  // login.html自体とコールバックは除外
  const path = location.pathname;
  const isLoginPage = path.endsWith('login.html');

  if (!isLoginPage && (!session || !window.CONFIG.GAS_EMAIL_URL)) {
    const back = encodeURIComponent(location.href);
    location.replace('./login.html?back=' + back);
  }
})();
