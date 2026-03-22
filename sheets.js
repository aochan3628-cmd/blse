/**
 * BLSE v2 — Sheets アクセスモジュール（GASプロキシ版）
 * Auth.getToken() / OAuth 不要。GAS経由でSheetsを操作する。
 * 依存: config.js のみ
 */

const Sheets = (() => {
    // ⚠️ シークレットは config.js（.gitignore対象）から取得する
    function _secret() {
        if (typeof CONFIG === 'undefined' || !CONFIG.GAS_SECRET) {
            console.error('[Sheets] CONFIG.GAS_SECRET が未設定です');
            return '';
        }
        return CONFIG.GAS_SECRET;
    }

    function _gasUrl() {
        return CONFIG.GAS_EMAIL_URL;
    }

    // ── API遅延監視（N2）— 3000ms超えたらDiscord #alerts通知 ──────────
    function _alertLatency(label, ms) {
        if (ms <= 3000) return;
        const wh = (typeof CONFIG !== 'undefined') && CONFIG.DISCORD_WEBHOOK_ALERTS;
        if (!wh) return;
        fetch(wh, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: `🟡 BLSE API遅延: ${label} ${Math.round(ms)}ms` }),
        }).catch(() => { });
    }

    // ── GET系リクエスト（readSheet） ──────────────────────────────────
    async function _get(params) {
        const t0 = performance.now();
        const url = new URL(_gasUrl());
        url.searchParams.set('secret', _secret());
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
        const res = await fetch(url.toString());
        _alertLatency(`GAS GET ${params.sheet || ''}`, performance.now() - t0);
        if (!res.ok) throw new Error(`GAS GET error: ${res.status}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || 'GAS エラー');
        return json;
    }

    // ── POST系リクエスト（appendRow / updateCell / sendEmail） ────────
    async function _post(body) {
        const t0 = performance.now();
        const res = await fetch(_gasUrl(), {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },  // プリフライト回避
            body: JSON.stringify({ secret: _secret(), ...body }),
        });
        _alertLatency(`GAS POST ${body.action || ''}`, performance.now() - t0);
        if (!res.ok) throw new Error(`GAS POST error: ${res.status}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || 'GAS エラー');
        return json;
    }

    // ── 全行取得 ──────────────────────────────────────────────────────
    // raw=true（デフォルト）: 配列形式 [row[0], row[1], ...]  check.html / log.html 向け
    // raw=false: オブジェクト形式 { ヘッダー名: 値, ... }      inbox.html 向け
    async function readAll(sheetName, raw = true) {
        const params = { action: 'readSheet', sheet: sheetName };
        if (raw) params.raw = '1';
        const data = await _get(params);
        return data.rows || [];
    }

    // ── 行追加 ────────────────────────────────────────────────────────
    // values: 配列（1行分）
    async function append(sheetName, values) {
        return _post({ action: 'appendRow', sheet: sheetName, values });
    }

    // ── セル更新（1始まりの行番号・列番号で指定） ─────────────────────
    // rowIndex: 1始まり整数, col: 1始まり整数 または 'A'〜'AZ'形式
    async function updateCell(sheetName, rowIndex, col, value) {
        const colNum = typeof col === 'string' ? _colNumber(col) : col;
        return _post({ action: 'updateCell', sheet: sheetName, row: rowIndex, col: colNum, value });
    }

    // ── ヘッダー名でセル更新（GAS側でヘッダー検索） ──────────────────
    async function updateCellByHeader(sheetName, rowIndex, headerName, value) {
        return _post({ action: 'updateCellByHeader', sheet: sheetName, row: rowIndex, header: headerName, value });
    }

    // ── 行を別シートに移動（追記→元行クリア） ────────────────────────
    async function moveRow(srcSheet, rowIndex, dstSheet, values) {
        await append(dstSheet, values);
        await _post({ action: 'clearRow', sheet: srcSheet, row: rowIndex });
        return { ok: true };
    }

    // A1記法列文字 → 1始まり整数（例: A→1, Z→26, AA→27）
    function _colNumber(colStr) {
        let n = 0;
        for (const c of colStr.toUpperCase()) {
            n = n * 26 + (c.charCodeAt(0) - 64);
        }
        return n;
    }

    return { readAll, append, updateCell, updateCellByHeader, moveRow, _post, _colNumber };
})();

// ── JS エラー監視 → Discord通知（仕様書 J1） ──────────────────────────────
(function _installErrorMonitor() {
    function _discordErr(msg) {
        const webhook = (typeof CONFIG !== 'undefined') && CONFIG.DISCORD_WEBHOOK;
        if (!webhook) return;
        const page = location.pathname.split('/').pop() || 'unknown';
        fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: `🔴 BLSE JSエラー [${page}]\n\`\`\`\n${msg}\n\`\`\`` }),
        }).catch(() => { });
    }

    window.onerror = function (msg, src, line, col, err) {
        _discordErr(`${msg}\n${src}:${line}:${col}`);
        return false;  // 既定のコンソール表示は維持
    };

    window.addEventListener('unhandledrejection', function (ev) {
        _discordErr(`Unhandled Promise rejection: ${ev.reason}`);
    });
})();

// ── R3: オフライン検知 + localStorageキュー ───────────────────────────────
(function _installOfflineSupport() {
    const QUEUE_KEY = 'blse_offline_queue';

    // オフラインバナーを表示/非表示
    function _setOfflineBanner(isOffline) {
        let banner = document.getElementById('_blseOfflineBanner');
        if (isOffline) {
            if (!banner) {
                banner = document.createElement('div');
                banner.id = '_blseOfflineBanner';
                banner.style.cssText = [
                    'position:fixed;top:0;left:0;right:0;z-index:99999',
                    'background:#f59e0b;color:#000;text-align:center',
                    'font-size:.75rem;font-weight:600;padding:4px 8px',
                    'letter-spacing:.02em',
                ].join(';');
                banner.textContent = '⚠️ オフライン — 操作はキューに保存され、復帰時に自動同期します';
                document.body ? document.body.prepend(banner)
                    : document.addEventListener('DOMContentLoaded', () => document.body.prepend(banner));
            }
        } else {
            if (banner) banner.remove();
        }
    }

    // キューを localStorage に保存
    function _enqueue(body) {
        const q = _loadQueue();
        q.push({ body, ts: Date.now() });
        localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
        console.info('[Sheets] オフライン: キューに追加', body.action);
    }

    function _loadQueue() {
        try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
        catch (e) { return []; }
    }

    // キューをフラッシュ（オンライン復帰時）
    async function _flushQueue() {
        const q = _loadQueue();
        if (!q.length) return;
        localStorage.removeItem(QUEUE_KEY);
        console.info(`[Sheets] 復帰: ${q.length}件をフラッシュ`);
        const gasUrl = (typeof CONFIG !== 'undefined') && CONFIG.GAS_EMAIL_URL;
        const secret = (typeof CONFIG !== 'undefined') && CONFIG.GAS_SECRET;
        for (const item of q) {
            try {
                const res = await fetch(gasUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({ secret, ...item.body }),
                });
                if (!res.ok) throw new Error(`GAS POST error: ${res.status}`);
                const json = await res.json();
                if (!json.ok) console.warn('[Sheets] フラッシュ失敗:', json.error);
                else console.info('[Sheets] フラッシュ成功:', item.body.action);
            } catch (e) {
                console.warn('[Sheets] フラッシュエラー:', e.message);
                // 失敗したものはキューに戻して中断
                const remaining = _loadQueue();
                remaining.unshift(item);
                localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
                break;
            }
        }
    }

    // Sheets の書き込み系メソッドをオフライン対応にラップ
    function _wrapSheets() {
        if (typeof Sheets === 'undefined') return;
        const writeOps = ['append', 'updateCell', 'updateCellByHeader'];
        writeOps.forEach(method => {
            const orig = Sheets[method];
            Sheets[method] = async function (...args) {
                if (!navigator.onLine) {
                    let qBody = null;
                    if (method === 'append') {
                        qBody = { action: 'appendRow', sheet: args[0], values: args[1] };
                    } else if (method === 'updateCell') {
                        const colNum = typeof args[2] === 'string'
                            ? Sheets._colNumber(args[2])
                            : args[2];
                        qBody = { action: 'updateCell', sheet: args[0], row: args[1], col: colNum, value: args[3] };
                    } else if (method === 'updateCellByHeader') {
                        qBody = { action: 'updateCellByHeader', sheet: args[0], row: args[1], header: args[2], value: args[3] };
                    }
                    if (qBody) _enqueue(qBody);
                    return { ok: true, queued: true };
                }
                return orig.apply(Sheets, args);
            };
        });
    }

    // オンライン復帰 → バナー非表示 + キューフラッシュ
    window.addEventListener('online', () => {
        _setOfflineBanner(false);
        _flushQueue().catch(() => { });
    });
    // オフライン → バナー表示
    window.addEventListener('offline', () => {
        _setOfflineBanner(true);
    });

    // 初期状態がオフラインの場合
    if (!navigator.onLine) _setOfflineBanner(true);

    // DOMContentLoaded後にSheets をラップ（Sheetsは同ファイルで既に定義済み）
    document.addEventListener('DOMContentLoaded', () => {
        _wrapSheets();
        // 起動時にも残存キューをフラッシュ（前回オフライン時の残り）
        if (navigator.onLine) _flushQueue().catch(() => { });
    });
})();
