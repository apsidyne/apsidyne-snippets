const STORAGE_KEY = 'snippetList';

/**
 * 画面にスニペット行を追加する
 */
const addRow = (trigger = '', text = '', domain = '') => {
    const list = document.getElementById('snippetList');
    const div = document.createElement('div');
    div.className = 'snippet-row';
    
    // HTML構築（XSS対策のためvalueはsetAttribute等で行うのがベストだが、管理画面なので簡易実装）
    div.innerHTML = `
        <input type="text" class="trigger" placeholder="例: ;tel" value="${escapeHtml(trigger)}">
        <textarea class="text" placeholder="挿入する文章">${escapeHtml(text)}</textarea>
        <input type="text" class="domain" placeholder="例: suumo.jp" value="${escapeHtml(domain)}">
        <button class="remove-btn">削除</button>
    `;

    // 削除ボタン
    div.querySelector('.remove-btn').addEventListener('click', () => {
        div.remove();
    });

    list.appendChild(div);
};

const escapeHtml = (str) => {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;', '<': '&lt;', '>': '&gt;',
            '"': '&quot;', "'": '&#039;'
        }[m];
    });
};

/**
 * 現在の画面状態からデータを収集して保存
 */
const saveOptions = () => {
    const rows = document.querySelectorAll('.snippet-row');
    const data = [];

    rows.forEach(row => {
        const trigger = row.querySelector('.trigger').value.trim();
        const text = row.querySelector('.text').value; 
        const domain = row.querySelector('.domain').value.trim().toLowerCase();

        if (trigger) {
            data.push({ trigger, text, domain });
        }
    });

    chrome.storage.local.set({ [STORAGE_KEY]: data }, () => {
        showStatus('設定を保存しました！', 'success');
        updateJsonView(data); // JSON表示も更新
    });
};

/**
 * ステータス表示のヘルパー
 */
const showStatus = (msg, type) => {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.style.color = type === 'success' ? '#28a745' : '#dc3545';
    setTimeout(() => { el.textContent = ''; }, 3000);
};

/**
 * データ読み込みと画面復元
 */
const restoreOptions = () => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
        const items = result[STORAGE_KEY] || [];
        
        // リストをクリア
        document.getElementById('snippetList').innerHTML = '';

        if (items.length === 0) {
            addRow(';sample', 'サンプルテキスト', '');
        } else {
            items.forEach(item => addRow(item.trigger, item.text, item.domain));
        }
        
        // JSONエリアも更新
        updateJsonView(items);
    });
};

// ---------------------------------------------------------
// ▼ 今回追加したデータ移行用の関数群
// ---------------------------------------------------------

/**
 * JSON表示エリアを更新する
 */
const updateJsonView = (data) => {
    const jsonStr = JSON.stringify(data, null, 2);
    document.getElementById('jsonOutput').value = jsonStr;
};

/**
 * JSONエリアの内容をクリップボードにコピー
 */
const copyJsonToClipboard = () => {
    const textarea = document.getElementById('jsonOutput');
    textarea.select();
    document.execCommand('copy');
    showStatus('クリップボードにコピーしました', 'success');
};

/**
 * JSONエリアの内容を取り込んで保存（インポート）
 */
const importJsonData = () => {
    const jsonStr = document.getElementById('jsonOutput').value;
    try {
        const parsed = JSON.parse(jsonStr);
        
        if (!Array.isArray(parsed)) {
            throw new Error('データ形式が不正です（配列ではありません）');
        }

        if (!confirm('現在の設定を上書きしてインポートしますか？\n（元に戻せません）')) {
            return;
        }

        // 保存して画面をリロード
        chrome.storage.local.set({ [STORAGE_KEY]: parsed }, () => {
            showStatus('インポート完了！', 'success');
            restoreOptions(); // 画面を再描画
        });

    } catch (e) {
        console.error(e);
        showStatus('エラー: JSON形式が正しくありません', 'error');
    }
};

// イベントリスナー登録
document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('addBtn').addEventListener('click', () => addRow());
document.getElementById('saveBtn').addEventListener('click', saveOptions);

// データ移行用ボタン
document.getElementById('copyJsonBtn').addEventListener('click', copyJsonToClipboard);
document.getElementById('importJsonBtn').addEventListener('click', importJsonData);
