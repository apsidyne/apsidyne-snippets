 /**
  * Apsidyne Tool - Options
  *  @author Apsidyne＠gmail.com
 **/

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
    importRadios: document.getElementsByName('importMode')
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
            sanitizedSnippets[cleanKey] = Sanitizer.sanitize(val);
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
}

/**
 * フォーム送信処理
 */
async function handleFormSubmit() {
    const keyword = elements.keyword.value.trim();
    const rawReplacement = elements.replacement.value;

    if (!keyword) {
        showToast('キーワードを入力してください', 'error');
        return;
    }

    // サニタイズ実行
    const cleanReplacement = Sanitizer.sanitize(rawReplacement);

    // キー変更のチェック（編集モード時）
    if (editTargetKeyword && editTargetKeyword !== keyword) {
        // キーが変わった場合、古いキーを削除する必要がある
        // ただし、新しいキーが既に存在する場合は上書き確認が必要だが
        // 今回はシンプルに上書きする仕様とする（必要ならconfirmを入れる）
        delete currentSnippets[editTargetKeyword];
    }

    // 更新
    currentSnippets[keyword] = cleanReplacement;

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

    elements.keyword.value = key;
    elements.replacement.value = val;
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
        const val = currentSnippets[key];
        
        // 検索フィルタ
        if (filterText && !key.toLowerCase().includes(filterText) && !val.toLowerCase().includes(filterText)) {
            return;
        }

        const tr = document.createElement('tr');
        
        // キーワード列
        const tdKey = document.createElement('td');
        tdKey.textContent = key; // XSS対策: textContentを使う
        tr.appendChild(tdKey);

        // コンテンツ列（プレビュー）
        const tdVal = document.createElement('td');
        // ここはHTMLとして表示したいが、script等はsanitize済みである前提
        // 念のためここでも安全な表示にするなら textContent だが、装飾を見せたいので innerHTML
        // Sanitizerを通したデータしか入っていないはずだが、防御的プログラミングとして
        // 表示時にも再度サニタイズしても良い。ここではデータ格納時にサニタイズ済みと信頼する。
        tdVal.innerHTML = val; 
        tr.appendChild(tdVal);

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
                throw new Error('JSONのルートはオブジェクト形式(Map)である必要があります。');
            }

            // 2. コンテンツバリデーション
            let validCount = 0;
            let invalidCount = 0;
            const newDataSet = {};

            for (const [key, val] of Object.entries(json)) {
                // キーと値が文字列であることを確認
                if (typeof key !== 'string' || typeof val !== 'string') {
                    invalidCount++;
                    continue;
                }
                
                // サニタイズ
                const cleanKey = key.trim();
                if (!cleanKey) {
                    invalidCount++;
                    continue;
                }
                const cleanVal = Sanitizer.sanitize(val);
                
                newDataSet[cleanKey] = cleanVal;
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
