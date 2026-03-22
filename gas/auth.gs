/**
 * BLSE v2 — 認証モジュール (auth.gs)
 * GASスクリプトプロパティに以下を設定すること:
 *   ADMIN_EMAIL      : aochan3628@gmail.com
 *   APPROVED_EMAILS  : カンマ区切りの承認済みメアド（例: aochan3628@gmail.com）
 *   GAS_SECRET       : 任意のランダム文字列
 *   PLACES_API_KEY   : GCP Places APIキー
 *   SPREADSHEET_ID   : スプレッドシートID
 *   FLASK_BACKEND_URL: http://192.168.1.233:5001
 *   DISCORD_WEBHOOK_ALERTS: Discord webhook URL（任意）
 */

/**
 * ログイン申請を処理するメイン関数
 * doPost() から呼ばれる（action: 'login'）
 */
function handleAuth(data) {
  try {
    var idToken = data.token;
    if (!idToken) return jsonRes({ status: 'error', msg: 'token missing' });

    // Google ID Token を decode（署名検証はしない：GAS制限のため）
    var parts = idToken.split('.');
    if (parts.length < 2) return jsonRes({ status: 'error', msg: 'invalid token' });
    var payloadStr = Utilities.newBlob(Utilities.base64Decode(parts[1] + '==')).getDataAsString();
    var payload = JSON.parse(payloadStr);
    var email = payload.email;
    if (!email) return jsonRes({ status: 'error', msg: 'no email in token' });

    var props = PropertiesService.getScriptProperties();
    var approvedRaw = props.getProperty('APPROVED_EMAILS') || '';
    var approved = approvedRaw.split(',').map(function(e) { return e.trim(); });

    if (approved.indexOf(email) >= 0) {
      // 承認済み → セッショントークン発行 + config返却
      var sessionToken = Utilities.getUuid();
      props.setProperty('SESSION_' + sessionToken, email + '|' + new Date().getTime());
      return jsonRes({
        status: 'approved',
        sessionToken: sessionToken,
        config: getConfigForClient_()
      });
    } else {
      // 未承認 → 管理者に承認メール送信
      sendApprovalRequest_(email, props);
      return jsonRes({ status: 'pending' });
    }

  } catch (e) {
    console.error('handleAuth error:', e);
    return jsonRes({ status: 'error', msg: e.message });
  }
}

/**
 * 承認リンクを処理（GETリクエスト）
 * doGet() から呼ばれる（action: 'approve'）
 */
function handleApprove(params) {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('GAS_SECRET') || '';
  if (params.secret !== secret) {
    return HtmlService.createHtmlOutput('<h2>❌ 認証エラー</h2>');
  }
  var email = params.email;
  if (!email) return HtmlService.createHtmlOutput('<h2>❌ メアドが不正</h2>');

  var approvedRaw = props.getProperty('APPROVED_EMAILS') || '';
  var approved = approvedRaw.split(',').map(function(e) { return e.trim(); }).filter(Boolean);
  if (approved.indexOf(email) < 0) {
    approved.push(email);
    props.setProperty('APPROVED_EMAILS', approved.join(','));
  }

  // 承認通知メールを申請者に送信
  var adminEmail = props.getProperty('ADMIN_EMAIL') || '';
  try {
    MailApp.sendEmail(email,
      '【BLSE】アクセスが承認されました',
      'こんにちは、\n\nBLSEへのアクセスが承認されました。\n以下のURLにアクセスしてGoogleログインしてください：\nhttps://aochan3628-cmd.github.io/blse/login.html\n\n管理者より'
    );
  } catch (e) {}

  return HtmlService.createHtmlOutput(
    '<html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;padding:40px">' +
    '<h2>✅ ' + email + ' を承認しました</h2>' +
    '<p>申請者にメールを送信しました。</p></body></html>'
  );
}

// ─── プライベート関数 ────────────────────────────

/** クライアントに返すconfig値（GASスクリプトプロパティから取得） */
function getConfigForClient_() {
  var props = PropertiesService.getScriptProperties();
  return {
    PLACES_API_KEY:         props.getProperty('PLACES_API_KEY')         || '',
    SPREADSHEET_ID:         props.getProperty('SPREADSHEET_ID')         || '',
    GAS_EMAIL_URL:          ScriptApp.getService().getUrl(),
    GAS_SECRET:             props.getProperty('GAS_SECRET')             || '',
    FLASK_BACKEND_URL:      props.getProperty('FLASK_BACKEND_URL')      || 'http://192.168.1.233:5001',
    DISCORD_WEBHOOK_ALERTS: props.getProperty('DISCORD_WEBHOOK_ALERTS') || '',
  };
}

/** 管理者に承認依頼メールを送信 */
function sendApprovalRequest_(email, props) {
  var adminEmail = props.getProperty('ADMIN_EMAIL') || '';
  if (!adminEmail) return;
  var secret = props.getProperty('GAS_SECRET') || '';
  var approveUrl = ScriptApp.getService().getUrl()
    + '?action=approve&email=' + encodeURIComponent(email)
    + '&secret=' + encodeURIComponent(secret);

  MailApp.sendEmail(adminEmail,
    '【BLSE】アクセス申請: ' + email,
    email + ' がBLSEへのアクセスを申請しました。\n\n' +
    '承認する場合はこちらをクリック:\n' + approveUrl + '\n\n' +
    '承認すると申請者にメールが届きます。'
  );
}

/** JSON レスポンス生成 */
function jsonRes(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
