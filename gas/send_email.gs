/**
 * BLSE v2 — GAS エンドポイント
 * 機能: メール送信 + Sheets読み書きプロキシ（クライアント側OAuth不要）
 * デプロイ: ウェブアプリとしてデプロイ / 実行: 自分として / アクセス: 全員
 */

const SECRET = PropertiesService.getScriptProperties().getProperty('GAS_SECRET') || 'blse_secret_2026_aoki';
const SHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '1PHdWvxq2cqIP5JKTamCXlKzlrSVGScZcfhm6HRdKl18';
const DAILY_SEND_LIMIT = 50; // 1日の送信上限

// ── GETリクエスト（ヘルスチェック + Sheets読み込み） ────────────────
function doGet(e) {
  const params = e.parameter;
  if (params.secret !== SECRET) {
    return _json({ ok: false, error: 'Unauthorized' });
  }
  const action = params.action;

  try {
    if (action === 'readSheet') {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(params.sheet);
      if (!sheet) return _json({ ok: false, error: 'シートが見つかりません: ' + params.sheet });
      const data = sheet.getDataRange().getValues();
      if (data.length < 2) return _json({ ok: true, rows: [] });
      // raw=1 の場合は配列のまま返す（フロントのCOLインデックスで参照できる）
      if (params.raw === '1') {
        return _json({ ok: true, rows: data.slice(1).map(row => row.map(v => v !== undefined ? String(v) : '')) });
      }
      const headers = data[0];
      const rows = data.slice(1).map(row =>
        Object.fromEntries(headers.map((h, i) => [h, row[i] !== undefined ? String(row[i]) : '']))
      );
      return _json({ ok: true, rows });
    }
    return _json({ ok: true, message: 'BLSE GAS OK' });
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // シークレット認証
    if (body.secret !== SECRET) {
      return _json({ ok: false, error: 'Unauthorized' });
    }

    const action = body.action;

    // ── Sheets: 行を追記 ──────────────────────────────────────────────
    if (action === 'appendRow') {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(body.sheet);
      if (!sheet) return _json({ ok: false, error: 'シートが見つかりません: ' + body.sheet });
      sheet.appendRow(body.values);
      return _json({ ok: true });
    }

    // ── Sheets: セル更新 ──────────────────────────────────────────────
    if (action === 'updateCell') {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(body.sheet);
      if (!sheet) return _json({ ok: false, error: 'シートが見つかりません: ' + body.sheet });
      sheet.getRange(body.row, body.col).setValue(body.value);
      return _json({ ok: true });
    }

    // ── Sheets: ヘッダー名でセル更新 ──────────────────────────────────
    if (action === 'updateCellByHeader') {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(body.sheet);
      if (!sheet) return _json({ ok: false, error: 'シートが見つかりません: ' + body.sheet });
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const colIdx = headers.indexOf(body.header);
      if (colIdx < 0) return _json({ ok: false, error: 'ヘッダーが見つかりません: ' + body.header });
      sheet.getRange(body.row, colIdx + 1).setValue(body.value);
      return _json({ ok: true });
    }

    // ── Sheets: 行をまるごとクリア ──────────────────────────────────
    if (action === 'clearRow') {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(body.sheet);
      if (!sheet) return _json({ ok: false, error: 'シートが見つかりません: ' + body.sheet });
      const lastCol = sheet.getLastColumn();
      const emptyRow = Array(lastCol).fill('');
      sheet.getRange(body.row, 1, 1, lastCol).setValues([emptyRow]);
      return _json({ ok: true });
    }

    // ── Sheets: 行を別シートに移動 ──────────────────────────────────
    if (action === 'moveRow') {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      const fromSheet = ss.getSheetByName(body.fromSheet);
      const toSheet   = ss.getSheetByName(body.toSheet);
      if (!fromSheet) return _json({ ok: false, error: 'fromSheet not found: ' + body.fromSheet });
      if (!toSheet)   return _json({ ok: false, error: 'toSheet not found: '   + body.toSheet });
      const rowIndex = Number(body.rowIndex);  // 1始まり
      const values = fromSheet.getRange(rowIndex, 1, 1, fromSheet.getLastColumn()).getValues()[0];
      toSheet.appendRow(values);
      fromSheet.deleteRow(rowIndex);
      return _json({ ok: true });
    }

    // ── Drive: ファイル保存（Base64 → PDF等） ──────────────────────────
    if (action === 'saveFile') {
      const bytes = Utilities.base64Decode(body.base64);
      const blob = Utilities.newBlob(bytes, body.mimeType || 'application/pdf', body.filename || 'report.pdf');
      const file = DriveApp.createFile(blob);
      return _json({ ok: true, fileId: file.getId(), url: file.getUrl() });
    }

    // ── メール送信 ────────────────────────────────────────────────────
    const { to, subject, body: mailBody, pdfDriveId } = body;

    // ① 日次送信上限チェック
    const todayKey = 'SENT_COUNT_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
    const props = PropertiesService.getScriptProperties();
    const sentToday = parseInt(props.getProperty(todayKey) || '0', 10);
    if (sentToday >= DAILY_SEND_LIMIT) {
      _notifyDiscord(`⚠️ BLSE 日次送信上限（${DAILY_SEND_LIMIT}件）に達しました。本日の送信をブロックしました。`, 'alerts');
      return _json({ ok: false, error: `本日の送信上限（${DAILY_SEND_LIMIT}件）に達しました` });
    }

    // ② 重複送信チェック（送信済みシートにこのメアドがあればブロック）
    try {
      const sentSheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('送信済み');
      if (sentSheet && sentSheet.getLastRow() > 1) {
        const sentEmails = sentSheet.getRange(2, 2, sentSheet.getLastRow() - 1, 1).getValues().flat().map(String);
        if (sentEmails.includes(to)) {
          return _json({ ok: false, error: '重複送信防止: ' + to + ' にはすでに送信済みです' });
        }
      }
    } catch (dupErr) {
      Logger.log('重複チェックエラー（スキップ）: ' + dupErr);
    }

    // PDF添付（Drive ID がある場合）
    let attachments = [];
    if (pdfDriveId) {
      const file = DriveApp.getFileById(pdfDriveId);
      attachments.push(file.getAs('application/pdf'));
    }

    GmailApp.sendEmail(to, subject, mailBody, {
      attachments,
      name: 'Blue Life 青木',
    });

    // 送信カウントをインクリメント
    props.setProperty(todayKey, String(sentToday + 1));

    _addSentLabel(to);
    _logSent(to, subject, body.companyName || '');
    _addSentCalendar(to, subject, body.companyName || '');

    return _json({ ok: true, sentToday: sentToday + 1, remaining: DAILY_SEND_LIMIT - sentToday - 1 });

  } catch (err) {
    _notifyDiscord('🔴 BLSE GAS エラー\n```' + err + '```', 'alerts');
    return _json({ ok: false, error: String(err) });
  }
}

function _logSent(to, subject, companyName) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const ws = ss.getSheetByName('送信済み');
  if (!ws) return;
  // A列:タイムスタンプ / B列:to / C列:件名 / D列:会社名 / E列:送信方法
  ws.appendRow([new Date().toISOString(), to, subject, companyName, 'メール送信']);
}

function _addSentLabel(to) {
  // 直前に送信したメールのスレッドに BLSE-sent ラベルを付与
  Utilities.sleep(2000);  // 送信完了を待つ
  const threads = GmailApp.search('to:' + to + ' label:sent', 0, 1);
  if (!threads.length) return;
  let label = GmailApp.getUserLabelByName('BLSE-sent');
  if (!label) label = GmailApp.createLabel('BLSE-sent');
  label.addToThread(threads[0]);
}

// ── カレンダー記録（送信） ───────────────────────────────────────────
function _addSentCalendar(to, subject, companyName) {
  try {
    const cal = CalendarApp.getDefaultCalendar();
    const now = new Date();
    const end = new Date(now.getTime() + 5 * 60 * 1000);  // 5分イベント
    const title = '📤 メール送信' + (companyName ? ' ' + companyName : '');
    const desc  = '件名: ' + subject + '\n宛先: ' + to;
    cal.createEvent(title, now, end, { description: desc, color: CalendarApp.EventColor.GREEN });
  } catch (e) {
    Logger.log('カレンダー記録エラー（送信）: ' + e);
  }
}

// ── Discord通知（3チャンネル対応） ─────────────────────────────────
// ch: 'alerts'（🔴🟡）/ 'logs'（全ログ）/ 'daily'（日次サマリー）
// 未設定の場合はDISCORD_WEBHOOKにフォールバック
function _notifyDiscord(msg, ch) {
  const props = PropertiesService.getScriptProperties();
  const chKey = ch === 'alerts' ? 'DISCORD_WEBHOOK_ALERTS'
              : ch === 'daily'  ? 'DISCORD_WEBHOOK_DAILY'
              : ch === 'logs'   ? 'DISCORD_WEBHOOK_LOGS'
              : null;
  const webhook = (chKey && props.getProperty(chKey))
                || props.getProperty('DISCORD_WEBHOOK');
  if (!webhook) return;
  try {
    UrlFetchApp.fetch(webhook, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ content: msg }),
    });
  } catch (e) {
    Logger.log('Discord通知エラー: ' + e);
  }
}

// ── JSON レスポンスヘルパー ──────────────────────────────────────────
function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ────────────────────────────────────────────────────────────────────
// スプシ自動バックアップ（毎日0:00 GASトリガーで実行）
// ────────────────────────────────────────────────────────────────────
// バックアップ対象: メインの名簿シート（最大データ量＝最優先保護対象）
const MASTER_SHEET_NAME = '未チェック（HP有り）';

function dailyBackup() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const master = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!master) {
    _notifyDiscord(`🔴 dailyBackup: ${MASTER_SHEET_NAME} シートが見つかりません`, 'alerts');
    return;
  }

  const date = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
  const backupName = 'backup_' + date;

  // 既に今日分がある場合はスキップ
  if (ss.getSheetByName(backupName)) {
    Logger.log('バックアップ既存: ' + backupName);
    return;
  }

  // コピー作成
  const backup = master.copyTo(ss);
  backup.setName(backupName);
  ss.setActiveSheet(backup);
  ss.moveActiveSheet(ss.getNumSheets());  // 末尾に移動

  // 7日以上前のバックアップを削除
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  ss.getSheets().forEach(sh => {
    const name = sh.getName();
    if (!name.startsWith('backup_')) return;
    const dateStr = name.replace('backup_', '');
    const shDate = Utilities.parseDate(dateStr, 'Asia/Tokyo', 'yyyyMMdd');
    if (shDate < cutoff) {
      ss.deleteSheet(sh);
      Logger.log('古いバックアップ削除: ' + name);
    }
  });

  const rowCount = master.getLastRow();
  _notifyDiscord(`🟢 BLSE バックアップ完了: ${backupName}（${rowCount}行）`, 'daily');
  Logger.log('バックアップ完了: ' + backupName + ' / ' + rowCount + '行');
}

// ────────────────────────────────────────────────────────────────────
// 毎朝6:00 生存確認通知（沈黙は最大の敵 対策）
// ────────────────────────────────────────────────────────────────────
function dailyHealthCheck() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const master = ss.getSheetByName(MASTER_SHEET_NAME);
    if (!master) {
      _notifyDiscord(`🔴 dailyHealthCheck: ${MASTER_SHEET_NAME} シート不在`, 'alerts');
      return;
    }

    const rowCount = master.getLastRow();
    const date = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd');

    // Drive容量チェック
    let driveInfo = '確認不可';
    try {
      const quota = DriveApp.getStorageLimit();   // bytes
      const used  = DriveApp.getStorageUsed();
      const pct   = Math.round(used / quota * 100);
      const usedGB = (used  / 1e9).toFixed(1);
      const totGB  = (quota / 1e9).toFixed(0);
      driveInfo = `${usedGB}GB / ${totGB}GB（${pct}%）`;
    } catch (e) { /* 無視 */ }

    // バックアップ確認
    const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
    const backupExists = !!ss.getSheetByName('backup_' + today);

    const msg = [
      `🟢 BLSE 日次レポート（${date}）`,
      `├ master: ${rowCount}行`,
      `├ 今日のバックアップ: ${backupExists ? '✅作成済み' : '⚠未作成（0:00トリガー確認要）'}`,
      `├ Drive: ${driveInfo}`,
      `└ GAS: ✅ 稼働中`,
    ].join('\n');

    _notifyDiscord(msg, 'daily');
    Logger.log('dailyHealthCheck 完了: ' + date);
  } catch (e) {
    _notifyDiscord('⚠️ 日次ヘルスチェック失敗: ' + e.message, 'alerts');
  }
}

/**
 * R6: スモークテスト — デプロイ後に手動実行して疏通を確認
 * GASエディタから　smokeTest() を実行して下さい
 */
function smokeTest() {
  var results = [];
  var ok = true;

  // 1. スプシ疏通テスト
  try {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheets()[0];
    var numSheets = ss.getSheets().length;
    results.push('✅ Sheets接続 OK (' + numSheets + '枚のシート)');
  } catch (e) {
    results.push('❌ Sheets接続失敗: ' + e.message);
    ok = false;
  }

  // 2. Gmailテストメール
  try {
    var testEmail = Session.getActiveUser().getEmail();
    MailApp.sendEmail({
      to: testEmail,
      subject: '[BLSE] スモークテスト ' + new Date().toLocaleString('ja-JP'),
      body: 'BLSE v2 GAS Web App のデプロイ後自動テストメールです。\n\nGmail送信 OK。',
    });
    results.push('✅ Gmail送信 OK → ' + testEmail);
  } catch (e) {
    results.push('❌ Gmail送信失敗: ' + e.message);
    ok = false;
  }

  // 3. Driveテスト
  try {
    var folder = DriveApp.getRootFolder();
    results.push('✅ Drive接続 OK (' + folder.getName() + ')');
  } catch (e) {
    results.push('❌ Drive接続失敗: ' + e.message);
    ok = false;
  }

  // 4. Discord通知
  var statusMark = ok ? '✅' : '❌';
  var msg = statusMark + ' BLSEスモークテスト結果\n' + results.join('\n');
  _notifyDiscord(msg, 'alerts');

  // 5. ログ出力（GASエディタの実行ログに表示）
  Logger.log(msg);
  return msg;
}
