/**
 * BLSE v2 — 設定ローダー
 * シークレットは localStorage に保存。このファイル自体には秘密情報なし。
 * 初回アクセス時は setup.html にリダイレクト。
 */
(function () {
  const saved = JSON.parse(localStorage.getItem('BLSE_CONFIG') || '{}');

  window.CONFIG = {
    PLACES_API_KEY: saved.PLACES_API_KEY || '',
    SPREADSHEET_ID: saved.SPREADSHEET_ID || '',
    GAS_EMAIL_URL: saved.GAS_EMAIL_URL || '',
    GAS_SECRET: saved.GAS_SECRET || '',
    OAUTH_CLIENT_ID: saved.OAUTH_CLIENT_ID || '',
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

  // 未設定なら setup.html へ（setup.html自体は除外）
  const isSetup = location.pathname.endsWith('setup.html');
  if (!isSetup && !window.CONFIG.GAS_EMAIL_URL) {
    const back = encodeURIComponent(location.href);
    location.replace('./setup.html?back=' + back);
  }
})();
