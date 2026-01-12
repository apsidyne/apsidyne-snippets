 /**
  * Apsidyne Tool - Options
  *  @author Apsidyne+ext2025[at]gmail.com
 **/

 import { setDebugMode, getDebugMode } from '../config.js';
import { Sanitizer } from '../lib/sanitizer.js';
import { Logger } from '../lib/logger.js';

const logger = new Logger('Options');

// DOM要素の参照キャッシュ
const elements = {
    form: document.getElementById('snippetForm'),
    keyword: document.getElementById('inputKeyword'),
    replacement: document.getElementById('inputReplacement'),
    btnCancel: document.getElementById('btnCancel'),
    tableBody: document.querySelector('#snippetTable tbody'),
    countSpan: document.getElementById('count'),
    searchBox: document.getElementById('searchBox'),
    btnExport: document.getElementById('btnExport'),
    btnImport: document.getElementById('btnImport'),
    fileImport: document.getElementById('fileImport'),
    importRadios: document.getElementsByName('importMode'),
    sites: document.getElementById('inputSites'),
    debugCheckbox: document.getElementById('checkDebugMode')
};

// 状態管理
let currentSnippets = {}; // メモリ上のキャッシュ { "keyword": "text", ... }
let editTargetKeyword = null; // 編集中のキーワード（キー変更検知用）

/**
 * 初期化処理
 */
async function init() {
    try {
        await loadSnippets();
        await loadSettings();
        renderTable();
        attachEvents();
    } catch (e) {
        showToast('初期化に失敗しました: ' + e.message, 'error');
    }
}

/**
 * ストレージからデータをロード
 */
async function loadSnippets() {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(['snippets'], (result) => {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            currentSnippets = result.snippets || {};
            resolve();
        });
    });
}

/**
 * データを保存
 */
async function saveSnippets(newSnippets) {
    return new Promise((resolve, reject) => {
        // 保存直前にも念のため全件サニタイズチェックを通すのが堅牢な設計
        const sanitizedSnippets = {};
        for (const [key, val] of Object.entries(newSnippets)) {
            // キーワードはトリム
            const cleanKey = key.trim();
            if (!cleanKey) continue;

            // 値はサニタイズ
            let dataToSave;

            if (typeof val === 'string') {
                // 旧形式(文字列)が来た場合、新形式にアップグレードして保存
                dataToSave = {
                    body: Sanitizer.sanitize(val),
                    sites: []
                };
            } else {
                // 新形式(オブジェクト)の場合
                // 中の .body プロパティをサニタイズする
                dataToSave = {
                    body: Sanitizer.sanitize(val.body || ''),
                    sites: Array.isArray(val.sites) ? val.sites : []
                };
            }

            sanitizedSnippets[cleanKey] = dataToSave;
        }

        chrome.storage.local.set({ snippets: sanitizedSnippets }, () => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                currentSnippets = sanitizedSnippets;
                resolve();
            }
        });
    });
}

/**
 * 設定をロード
 */

const loadSettings = async () => {
    try {
        const result = await chrome.storage.local.get(['settings']);
        const settings = result.settings || {};
        
        // チェックボックスに反映
        elements.debugCheckbox.checked = !!settings.debugMode;
    } catch (e) {
        showToast(`設定読み込みエラー: ${e.message}`, 'error');
    }
};

const saveSettings = async () => {
    try {
        const isDebug = elements.debugCheckbox.checked;
        
        // 既存の設定を取得してマージ
        const result = await chrome.storage.local.get(['settings']);
        const currentSettings = result.settings || {};
        
        const newSettings = {
            ...currentSettings,
            debugMode: isDebug
        };

        await setDebugMode(isDebug);   // 今はdebugModeしかない
        // debugレベルをstorageに保存する場合、storageのエラー時のdebugModeはどうあるべきなのか。
        //console.log("isDebug", isDebug);
        await chrome.storage.local.set({ settings: newSettings });
        
        if (isDebug) {
            showToast('デバッグモードをONにしました。');
        } else {
            showToast('デバッグモードをOFFにしました。');
        }

    } catch (e) {
        showToast(`設定保存エラー: ${e.message}`, 'error');
    }
};



/**
 * イベントリスナー設定
 */
function attachEvents() {
    // フォーム送信（登録・更新）
    elements.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleFormSubmit();
    });

    // キャンセルボタン
    elements.btnCancel.addEventListener('click', resetForm);

    // 検索フィルタ
    elements.searchBox.addEventListener('input', renderTable);

    // エクスポート
    elements.btnExport.addEventListener('click', handleExport);

    // インポート
    elements.btnImport.addEventListener('click', handleImport);
    
    // テーブル内の動的ボタン（編集/削除）はEvent Delegationで処理
    elements.tableBody.addEventListener('click', (e) => {
        const target = e.target;
        const key = target.dataset.key;
        if (!key) return;

        if (target.classList.contains('btn-delete')) {
            handleDelete(key);
        } else if (target.classList.contains('btn-edit')) {
            handleEdit(key);
        }
    });
    // degbug on/off
    elements.debugCheckbox.addEventListener('change', saveSettings);
}

/**
 * データを正規化してオブジェクト形式にする
 * 古いデータ構造に考慮するため
 */
function normalizeSnippet(val) {
    if (!val) return { body: '', sites: [] };

    if (typeof val === 'string') {
        // 旧形式の場合は、全サイト対象
        return { body: val, sites: [] };
    }
    // オブジェクトならそのまま（念のため構造チェック追加予定）
    return { 
        body: val.body || '', 
        sites: Array.isArray(val.sites) ? val.sites : [] 
    };
}

/**
 * フォーム送信処理
 */
async function handleFormSubmit() {
    const keyword = elements.keyword.value.trim();
    const rawReplacement = elements.replacement.value;
    const rawSites = elements.sites.value;

    if (!keyword) {
        showToast('キーワードを入力してください', 'error');
        return;
    }
    // サイトリストのパース (カンマ区切り → 配列)
    const sites = rawSites.split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    // 新しいデータ構造を作成
    const newEntry = {
        body: Sanitizer.sanitize(rawReplacement),
        sites: sites
    };

 
    // キー変更のチェック（編集モード時）
    if (editTargetKeyword && editTargetKeyword !== keyword) {
        // キーが変わった場合、古いキーを削除する
        // 新しいキーが既に存在する場合は上書き確認が必要なのだが
        // 今は上書きする仕様にする（confirmを入れるかも）
        delete currentSnippets[editTargetKeyword];
    }

    // 更新
    currentSnippets[keyword] = newEntry;

    try {
        await saveSnippets(currentSnippets);
        showToast('保存しました', 'success');
        resetForm();
        renderTable();
    } catch (e) {
        showToast('保存エラー: ' + e.message, 'error');
    }
}

/**
 * 編集モード開始
 */
function handleEdit(key) {
    const val = currentSnippets[key];
    if (val === undefined) return;
    if (!val) return;

    const data = normalizeSnippet(val);

    elements.keyword.value = key;
    elements.replacement.value = data.body;
    elements.sites.value = data.sites.join(', ');
    editTargetKeyword = key;

    elements.btnCancel.style.display = 'inline-block';
    elements.form.querySelector('button[type="submit"]').textContent = '更新';
    
    // フォームへスクロール
    elements.form.scrollIntoView({ behavior: 'smooth' });
}

/**
 * 削除処理
 */
async function handleDelete(key) {
    if (!confirm(`キーワード「${key}」を削除しますか？`)) return;

    delete currentSnippets[key];
    try {
        await saveSnippets(currentSnippets);
        showToast('削除しました', 'success');
        
        // 編集中のものを削除した場合、フォームもリセット
        if (editTargetKeyword === key) {
            resetForm();
        }
        renderTable();
    } catch (e) {
        showToast('削除エラー: ' + e.message, 'error');
    }
}

/**
 * フォームリセット
 */
function resetForm() {
    elements.form.reset();
    editTargetKeyword = null;
    elements.btnCancel.style.display = 'none';
    elements.form.querySelector('button[type="submit"]').textContent = '保存';
}

/**
 * テーブル描画
 */
function renderTable() {
    const tbody = elements.tableBody;
    tbody.innerHTML = ''; // クリア

    const filterText = elements.searchBox.value.toLowerCase();
    const keys = Object.keys(currentSnippets).sort();
    let count = 0;

    keys.forEach(key => {
        const rawVal = currentSnippets[key];
        const data = normalizeSnippet(rawVal);
        
        // 検索フィルタ (body または sites にヒットするか)
        const searchTarget = (key + data.body + data.sites.join(' ')).toLowerCase();
        if (filterText && !searchTarget.includes(filterText)) return;

        const tr = document.createElement('tr');

        // キーワード
        const tdKey = document.createElement('td');
        tdKey.textContent = key;
        tr.appendChild(tdKey);

        // 展開内容
        const tdVal = document.createElement('td');
        tdVal.innerHTML = data.body; 
        tr.appendChild(tdVal);

        // 対象サイト列
        const tdSites = document.createElement('td');
        if (data.sites.length === 0) {
            tdSites.innerHTML = '<span class="badge global">全サイト</span>';
        } else {
            // タグ表示
            tdSites.innerHTML = data.sites.map(s => 
                `<span class="badge site">${escapeHtml(s)}</span>`
            ).join(' ');
        }
        tr.appendChild(tdSites);

        // 操作列
        const tdAction = document.createElement('td');
        tdAction.innerHTML = `
            <button class="btn-sm btn-edit" data-key="${escapeHtml(key)}">編集</button>
            <button class="btn-sm btn-delete warning" data-key="${escapeHtml(key)}">削除</button>
        `;
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
        count++;
    });

    elements.countSpan.textContent = count;
}

/**
 * HTMLエスケープ（属性値埋め込み用）
 */
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

/**
 * JSONエクスポート
 */
function handleExport() {
    const dataStr = JSON.stringify(currentSnippets, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    // ダウンロードリンク生成
    const a = document.createElement('a');
    a.href = url;
    a.download = `real-estate-snippets_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * JSONインポート（厳格なチェック付き）
 */
async function handleImport() {
    const file = elements.fileImport.files[0];
    if (!file) {
        showToast('ファイルを選択してください', 'error');
        return;
    }

    const mode = Array.from(elements.importRadios).find(r => r.checked).value; // 'merge' or 'overwrite'

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const json = JSON.parse(e.target.result);
            
            // 1. 型チェック（オブジェクトであること）
            if (typeof json !== 'object' || json === null || Array.isArray(json)) {
                throw new Error('JSONの形式が正しくありません。');
            }

            // 2. コンテンツバリデーション
            let validCount = 0;
            let invalidCount = 0;
            const newDataSet = {};

            for (const [key, val] of Object.entries(json)) {
                // キーが文字列
                if (typeof key !== 'string' || !key.trim()){
                    invalidCount++;
                    continue;
                }
                const cleanKey = key.trim();

                let cleanData;
                if (typeof val === 'string') {
                    // ケースA: 旧形式（値が文字列）
                    // v2形式へアップグレードして取り込む
                    cleanData = {
                        body: Sanitizer.sanitize(val),
                        sites: [] // サイト指定なし
                    };
                } 
                else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                    // ケースB: 新形式（値がオブジェクト）
                    // 必須フィールド 'body' の存在チェック
                    if (typeof val.body !== 'string') {
                        // bodyが無い、または文字列じゃない場合は不正データとみなす
                        invalidCount++;
                        continue;
                    }

                    cleanData = {
                        body: Sanitizer.sanitize(val.body),
                        sites: Array.isArray(val.sites) ? val.sites : [] // sitesが無ければ空配列
                    };
                } 
                else {
                    // ケースC: それ以外の型（数値や配列など）は不正
                    invalidCount++;
                    continue;
                }
                newDataSet[cleanKey] = cleanData;
                validCount++;
            }

            if (validCount === 0) {
                throw new Error('有効なデータが含まれていませんでした。');
            }

            // 3. マージ処理
            let mergedSnippets;
            if (mode === 'overwrite') {
                // 完全上書き
                mergedSnippets = newDataSet;
                console.log('Mode: Overwrite');
            } else {
                // マージ（既存優先か、インポート優先か。通常はインポートデータを正とする上書きマージ）
                mergedSnippets = { ...currentSnippets, ...newDataSet };
                console.log('Mode: Merge');
            }

            // 4. 保存
            await saveSnippets(mergedSnippets);
            
            // 5. 完了通知
            renderTable();
            showToast(`インポート完了: ${validCount}件成功 (無効${invalidCount}件)`, 'success');
            elements.fileImport.value = ''; // ファイル選択クリア

        } catch (err) {
            console.error(err);
            showToast('インポート失敗: ' + err.message, 'error');
        }
    };
    reader.onerror = () => showToast('ファイル読み込みエラー', 'error');
    reader.readAsText(file);
}

/**
 * トースト通知（options画面用）
 * content.jsのものとは別に、この画面内で表示する
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const div = document.createElement('div');
    div.className = `toast toast-${type}`;
    div.textContent = message;
    
    container.appendChild(div);
    
    // 表示アニメーション
    requestAnimationFrame(() => {
        div.classList.add('show');
    });

    // 自動消去
    setTimeout(() => {
        div.classList.remove('show');
        div.addEventListener('transitionend', () => div.remove());
    }, 3000);
}

// 開始
init();
