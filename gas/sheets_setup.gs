/**
 * BLSE v2 — Google Sheets 初期化スクリプト
 * GASエディタで一度だけ実行する
 */

const SHEET_DEFS = [
  {
    name: '未チェック（HP有り）',
    headers: [
      'place_id','店名','住所','電話番号','HP URL','GBP URL',
      '評価','口コミ数','Driveフォルダ','写真枚数','営業時間','業種タイプ',
      '説明文','タブ分類','SSL','モバイル対応','老朽化',
      'メールアドレス','フォームURL','営業お断り','CAPTCHA',
      '写真チェック','レポートスクショ①','レポートスクショ②',
      '弱点タグ','自動スコア','営業文','担当者','送信方法',
      '送信ステータス','送信日時','取得日','返信ステータス','口コミ返信状況','priority_score'
    ]
  },
  { name: '未チェック（SNSのみ）',  headers: null },  // 同ヘッダーを流用
  { name: '未チェック（なし）',     headers: null },
  { name: 'チェック済み（メール）', headers: null },
  { name: 'チェック済み（フォーム）', headers: null },
  { name: '送信済み',              headers: null },
  { name: 'Playwright失敗待ち',   headers: null },
  { name: '送信不可',             headers: null },
];

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const baseHeaders = SHEET_DEFS[0].headers;

  SHEET_DEFS.forEach(def => {
    let sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
      Logger.log('作成: ' + def.name);
    } else {
      Logger.log('既存: ' + def.name);
    }

    // ヘッダー行がなければセット
    const firstRow = sheet.getRange(1, 1, 1, baseHeaders.length).getValues()[0];
    if (!firstRow[0]) {
      sheet.getRange(1, 1, 1, baseHeaders.length).setValues([baseHeaders]);
      sheet.getRange(1, 1, 1, baseHeaders.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
      Logger.log('ヘッダー設定: ' + def.name);
    }
  });

  Logger.log('✅ 初期化完了');
}

// ─────────────────────────────────────────────────────────────────────────
// 自動バックアップ（毎日 0:00 に実行）
// GASトリガー設定: setupDailyBackupTrigger() を一度だけ手動実行すること
// ─────────────────────────────────────────────────────────────────────────
function dailyBackup() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const master = ss.getSheetByName('未チェック（HP有り）');
  if (!master) {
    Logger.log('masterシートが見つかりません');
    return;
  }

  // バックアップ作成
  const date   = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd');
  const bkName = 'backup_' + date;

  // 同名バックアップが既にあれば上書き
  const existing = ss.getSheetByName(bkName);
  if (existing) ss.deleteSheet(existing);

  const backup = master.copyTo(ss);
  backup.setName(bkName);
  const rowCount = master.getLastRow();
  Logger.log('バックアップ作成: ' + bkName + ' (' + rowCount + '行)');

  // 7世代より古いバックアップを削除
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffStr = Utilities.formatDate(cutoff, 'Asia/Tokyo', 'yyyyMMdd');

  ss.getSheets().forEach(sh => {
    const n = sh.getName();
    if (n.startsWith('backup_') && n.slice(7) < cutoffStr) {
      ss.deleteSheet(sh);
      Logger.log('古いバックアップ削除: ' + n);
    }
  });

  // Discord通知
  const webhookUrl = PropertiesService.getScriptProperties().getProperty('DISCORD_WEBHOOK');
  if (webhookUrl) {
    const payload = JSON.stringify({ content: '🟢 BLSE バックアップ完了: ' + bkName + ' (' + rowCount + '行)' });
    UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: payload,
      muteHttpExceptions: true,
    });
  }
}

// dailyBackup のトリガーを設定する（GASエディタで一度だけ手動実行）
function setupDailyBackupTrigger() {
  // 既存の dailyBackup トリガーを削除（重複防止）
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'dailyBackup') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // 毎日 0:00〜1:00 に実行
  ScriptApp.newTrigger('dailyBackup')
    .timeBased()
    .everyDays(1)
    .atHour(0)
    .create();
  Logger.log('✅ dailyBackup トリガー設定完了（毎日0:00）');
}

