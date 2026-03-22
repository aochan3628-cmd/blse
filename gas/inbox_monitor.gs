/**
 * BLSE v2 — GAS 受信トレイ監視（5分トリガー）
 * トリガー設定: 時間主導型 > 5分おき
 * 実装:
 *   ① 未読メール取得 → 送信済みメアドとマッチング
 *   ② カテゴリ分類（見積/質問/断り/その他）
 *   ③ 返信ログシートに記録
 *   ④ Gmailラベル付与
 *   ⑤ Googleカレンダーにイベント作成（色分け）
 *   ⑥ タスクシートに自動生成（断り以外）
 *   ⑦ 操作ログに記録
 *   ⑧ Discord通知
 *   ⑨ 既読マーク
 */

function checkInbox() {
  const ss       = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
  );
  const sentWs   = ss.getSheetByName('送信済み');
  const replyLog = ss.getSheetByName('返信ログ') || _createSheet(ss, '返信ログ', [
    'タイムスタンプ', '差出人', '件名', '本文冠頭', 'カテゴリ', '会社名', '対応ステータス'
  ]);
  const taskWs   = ss.getSheetByName('タスク') || _createSheet(ss, 'タスク', [
    'タイムスタンプ', 'タイトル', '優先度', '期限', '会社名', 'カテゴリ', 'ステータス'
  ]);
  const opLog    = ss.getSheetByName('操作ログ');

  // 送信済みメアドを取得（列: A=ts B=to C=subject D=company E=method）
  const sentRows   = sentWs.getDataRange().getValues().slice(1);
  const sentEmails = new Set(sentRows.map(r => String(r[1]).trim()));

  // BLSE-sent ラベルがついたスレッド内の未読メッセージのみを対象にする
  // → BLSE送信以外の受信メールを誤処理しない
  const threads = GmailApp.search('is:unread label:BLSE-sent', 0, 50);
  threads.forEach(thread => {
    thread.getMessages().forEach(msg => {
      const fromRaw = msg.getFrom();
      const email   = fromRaw.replace(/.*<(.+)>/, '$1').trim();
      if (!msg.isUnread() || !sentEmails.has(email)) return;

      const from    = fromRaw;
      const subject = msg.getSubject();
      const body    = msg.getPlainBody().slice(0, 500);
      const cat     = _categorize(body);
      const company = _findCompany(sentRows, email);
      const now     = new Date();

      // ── ① 返信ログ ──────────────────────────────────────────────────
      replyLog.appendRow([now.toISOString(), from, subject, body, cat, company, '未対応']);

      // ── ② Gmailラベル ────────────────────────────────────────────────
      _addLabel(msg, 'BLSE/' + cat);
      msg.markRead();

      // ── ③ Googleカレンダー ──────────────────────────────────────────
      _addCalendarEvent(company, from, body, cat, now);

      // ── ④ タスク自動生成（断りは除外） ─────────────────────────────
      if (cat !== 'お断り') {
        _createTask(taskWs, company, cat, now);
      }

      // ── ⑤ 操作ログ ──────────────────────────────────────────────────
      if (opLog) {
        opLog.appendRow([now.toISOString(), 'GAS', '返信検知', company, cat]);
      }

      // ── ⑥ Discord通知（logsチャンネル） ─────────────────────────────
      _notifyDiscord(`📬 返信あり: ${company}\nカテゴリ: ${cat}\n${body.slice(0, 100)}`, 'logs');
    });
  });
}

// ── カテゴリ分類 ──────────────────────────────────────────────────────
function _categorize(body) {
  if (/見積|金額|費用|料金|いくら/.test(body)) return '見積もり依頼';
  if (/結構|不要|必要ありません|お断り/.test(body))  return 'お断り';
  if (/[？?]|教えて|詳しく/.test(body))             return '質問';
  return 'その他';
}

// ── 会社名検索（送信済みリストから） ─────────────────────────────────
function _findCompany(sentRows, email) {
  const found = sentRows.find(r => String(r[1]).trim() === email);
  return found ? found[3] : email;  // D列 = 会社名
}

// ── Gmailラベル付与 ───────────────────────────────────────────────────
function _addLabel(msg, name) {
  let label = GmailApp.getUserLabelByName(name);
  if (!label) label = GmailApp.createLabel(name);
  label.addToThread(msg.getThread());
}

// ── Googleカレンダーにイベント作成 ────────────────────────────────────
// 色: 見積=青(CYAN) / 質問=黄(YELLOW) / 断り=赤(RED) / その他=緑(SAGE)
function _addCalendarEvent(company, from, body, cat, receivedAt) {
  const colorMap = {
    '見積もり依頼': CalendarApp.EventColor.CYAN,
    '質問':         CalendarApp.EventColor.YELLOW,
    'お断り':       CalendarApp.EventColor.RED,
    'その他':       CalendarApp.EventColor.SAGE,
  };
  const cal   = CalendarApp.getDefaultCalendar();
  const end   = new Date(receivedAt.getTime() + 30 * 60 * 1000);  // 30分枠
  const title = `📬 ${company}（${cat}）からメール`;
  const desc  = `差出人: ${from}\nカテゴリ: ${cat}\n\n本文:\n${body.slice(0, 200)}`;
  const event = cal.createEvent(title, receivedAt, end, { description: desc });
  event.setColor(colorMap[cat] || CalendarApp.EventColor.SAGE);
}

// ── タスクシートに自動生成 ─────────────────────────────────────────────
// 期限: 見積=24h / 質問=48h / その他=72h
function _createTask(taskWs, company, cat, now) {
  const deadlineMap = { '見積もり依頼': 24, '質問': 48 };
  const hours     = deadlineMap[cat] || 72;
  const priority  = cat === '見積もり依頼' ? '🔴最優先' : cat === '質問' ? '🟡通常' : '🟢低優先';
  const taskTitle = cat === '見積もり依頼' ? `${company}に見積もり送付`
                  : cat === '質問'         ? `${company}に回答`
                  :                         `${company} 内容確認`;
  const deadline  = new Date(now.getTime() + hours * 60 * 60 * 1000);
  taskWs.appendRow([
    now.toISOString(),
    taskTitle,
    priority,
    deadline.toISOString(),
    company,
    cat,
    '未対応',
  ]);
}

// ── シート新規作成 ─────────────────────────────────────────────────────
function _createSheet(ss, name, headers) {
  const ws = ss.insertSheet(name);
  ws.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  ws.setFrozenRows(1);
  return ws;
}

// ── Discord通知（3チャンネル対応） ───────────────────────────────────
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
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({ content: msg }),
    });
  } catch (e) {
    Logger.log('Discord通知エラー: ' + e);
  }
}
