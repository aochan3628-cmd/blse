/**
 * BLSE v2 — Google OAuth2 認証モジュール
 * スコープ: Sheets + Drive.file
 * トークンはlocalStorageに保存してページ遷移後も再利用
 */

const Auth = (() => {
    const SCOPES = [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
    ].join(' ');

    const LS_TOKEN = 'blse_access_token';
    const LS_EXPIRES = 'blse_token_expires';

    let _tokenClient = null;

    // localStorageからトークン読み込み（ページ遷移後も再利用）
    let _token = localStorage.getItem(LS_TOKEN) || null;
    let _expiresAt = parseInt(localStorage.getItem(LS_EXPIRES) || '0', 10);

    function _saveToken(token, expiresIn) {
        _token = token;
        _expiresAt = Date.now() + (expiresIn - 60) * 1000;
        localStorage.setItem(LS_TOKEN, _token);
        localStorage.setItem(LS_EXPIRES, String(_expiresAt));
    }

    function _createClient(resolve, reject) {
        _tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CONFIG.OAUTH_CLIENT_ID,
            scope: SCOPES,
            callback: (resp) => {
                if (resp.error) { reject(new Error(resp.error)); return; }
                _saveToken(resp.access_token, resp.expires_in);
                resolve(_token);
            },
        });
    }

    // トークン取得（localStorageキャッシュ優先、期限切れなら再取得）
    function getToken() {
        return new Promise((resolve, reject) => {
            // キャッシュが有効なら即返す（ポップアップ不要）
            if (_token && Date.now() < _expiresAt) {
                resolve(_token);
                return;
            }
            // google GSIが未ロードなら最大5秒待機してリトライ
            const tryInit = (retries) => {
                if (typeof google !== 'undefined' && google.accounts) {
                    if (!_tokenClient) _createClient(resolve, reject);
                    _tokenClient.callback = (resp) => {
                        if (resp.error) { reject(new Error(resp.error)); return; }
                        _saveToken(resp.access_token, resp.expires_in);
                        resolve(_token);
                    };
                    _tokenClient.requestAccessToken({ prompt: _token ? '' : 'consent' });
                } else if (retries > 0) {
                    setTimeout(() => tryInit(retries - 1), 500);
                } else {
                    reject(new Error('Google Identity Services が読み込まれていません'));
                }
            };
            tryInit(10);
        });
    }

    // ログイン済みユーザー名（表示用）
    function userName() {
        return localStorage.getItem('blse_user') || 'AOKI';
    }

    return { getToken, userName };
})();
