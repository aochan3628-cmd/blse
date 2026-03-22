/**
 * BLSE v2 — Googleカレンダー 自動記録スクリプト
 *
 * 「送信済み」シートの新規行を検知してカレンダーにイベントを追加する。
 * 実行タイミング: 毎時0分トリガー推奨（inbox_monitorの5分とは別途設定）
 *
 * スクリプトプロパティ（PropertiesService）に設定が必要:
 *   CALENDAR_ID : 対象カレンダーのID（メールアドレス形式）
 *   LAST_ROW    : 最後に処理した行番号（自動更新）
 */

const SENT_SHEET_NAME = '送信済み';
const CAL_COLOR       = CalendarApp.EventColor.CYAN; // 水色

// ── メイン：未処理の送信済み行をカレンダーに追加 ──────────────────────
function logSentToCalendar() {
  const props      = PropertiesService.getScriptProperties();
  const calId      = props.getProperty('CALENDAR_ID');
  if (!calId) { Logger.log('CALENDAR_ID 未設定'); return; }

  const cal        = CalendarApp.getCalendarById(calId);
  if (!cal)   { Logger.log('カレンダーが見つかりません: ' + calId); return; }

  const ss         = SpreadsheetApp.getActiveSpreadsheet();
  const sheet      = ss.getSheetByName(SENT_SHEET_NAME);
  if (!sheet) { Logger.log('「送信済み」シートが見つかりません'); return; }

  const lastProcessed = parseInt(props.getProperty('LAST_ROW') || '1', 10);
  const lastRow       = sheet.getLastRow();

  if (lastRow <= lastProcessed) {
    Logger.log('新規行なし (最終処理済み行: ' + lastProcessed + ')');
    return;
  }

  // ヘッダー行（1行目）のキーを取得
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col     = (name) => headers.indexOf(name); // 0始まりインデックス

  let added = 0;
  for (let row = lastProcessed + 1; row <= lastRow; row++) {
    const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    const get    = (name) => values[col(name)] || '';

    const coName    = get('店名') || get('会社名') || '（不明）';
    const sentAt    = get('送信日時');
    const method    = get('送信方法') || 'メール';
    const email     = get('メールアドレス') || get('送信先') || '';
    const subject   = get('件名') || `営業メール送信: ${coName}`;

    // 送信日時をパース（ISO or YYYY/MM/DD形式に対応）
    let eventDate = sentAt ? new Date(sentAt) : new Date();
    if (isNaN(eventDate.getTime())) eventDate = new Date();

    try {
      const event = cal.createAllDayEvent(
        `📤 ${coName}（${method}）`,
        eventDate,
        {
          description:
            `【店名】${coName}\n` +
            `【送信先】${email}\n` +
            `【件名】${subject}\n` +
            `【送信方法】${method}\n` +
            `【Sheets行】${row}`,
        }
      );
      event.setColor(CAL_COLOR);
      added++;
    } catch (e) {
      Logger.log('カレンダー追加失敗 (行' + row + '): ' + e.message);
    }
  }

  // 最終処理行を更新
  props.setProperty('LAST_ROW', String(lastRow));
  Logger.log('完了: ' + added + '件追加 → 最終行 ' + lastRow);
}

// ── 毎時トリガー設定ヘルパー（初回1回だけ実行） ──────────────────────
function setupHourlyTrigger() {
  // 既存トリガーを削除
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'logSentToCalendar')
    .forEach(t => ScriptApp.deleteTrigger(t));

  // 毎時0分に実行
  ScriptApp.newTrigger('logSentToCalendar')
    .timeBased()
    .everyHours(1)
    .create();

  Logger.log('✅ 毎時トリガー設定完了');
}
